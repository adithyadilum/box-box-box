import * as fs from 'fs';
import * as path from 'path';

// --- INTERFACES ---
interface PitStop { lap: number; from_tire: string; to_tire: string; }
interface DriverStrategy { driver_id: string; starting_tire: string; pit_stops: PitStop[]; }
interface RaceConfig { track: string; total_laps: number; base_lap_time: number; pit_lane_time: number; track_temp: number; }
interface RaceRecord { race_id: string; race_config: RaceConfig; strategies: Record<string, DriverStrategy>; finishing_positions: string[]; }

// Precomputed structures for extreme performance
interface Stint { tire: string; laps: number; }
interface PrecomputedDriver { id: string; pitPenalty: number; stints: Stint[]; }
interface PrecomputedRace { id: string; temp: number; baseTimeTotal: number; drivers: PrecomputedDriver[]; actualPositions: string[]; }

// --- MATH HELPERS ---
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const exp = Math.exp;
const round = Math.round;

// --- THE CONSTRAINED PARAMETER DECODER ---
function decodeParameters(a: number[]) {
    // Using the exact constrained parameter vector you recommended
    const med_speed = exp(a[0] ?? 0);
    const hard_speed = med_speed + exp(a[1] ?? 0);

    const soft_grace = round(1 + 20 * sigmoid(a[2] ?? 0));
    const med_grace = soft_grace + 1 + round(20 * sigmoid(a[3] ?? 0));
    const hard_grace = med_grace + 1 + round(20 * sigmoid(a[4] ?? 0));

    const hard_wear = exp(a[5] ?? 0);
    const med_wear = hard_wear + exp(a[6] ?? 0);
    const soft_wear = med_wear + exp(a[7] ?? 0);

    const temp_scale = exp(a[8] ?? 0);
    const temp_power = 0.5 + 2.0 * sigmoid(a[9] ?? 0);

    return { med_speed, hard_speed, soft_grace, med_grace, hard_grace, hard_wear, med_wear, soft_wear, temp_scale, temp_power };
}

// --- DATA PREPARATION ---
function precomputeRaces(rawRaces: RaceRecord[]): PrecomputedRace[] {
    return rawRaces.map(race => {
        const config = race.race_config;
        const drivers: PrecomputedDriver[] = [];

        for (const strategy of Object.values(race.strategies)) {
            const pitStops = [...strategy.pit_stops].sort((a, b) => a.lap - b.lap);
            const stints: Stint[] = [];

            let currentLap = 1;
            let currentTire = strategy.starting_tire;

            for (const pit of pitStops) {
                stints.push({ tire: currentTire, laps: pit.lap - currentLap + 1 });
                currentTire = pit.to_tire;
                currentLap = pit.lap + 1;
            }
            // Final stint
            if (currentLap <= config.total_laps) {
                stints.push({ tire: currentTire, laps: config.total_laps - currentLap + 1 });
            }

            drivers.push({
                id: strategy.driver_id,
                pitPenalty: pitStops.length * config.pit_lane_time,
                stints
            });
        }

        return {
            id: race.race_id,
            temp: config.track_temp,
            baseTimeTotal: config.base_lap_time * config.total_laps,
            drivers,
            actualPositions: race.finishing_positions
        };
    });
}

// --- HIGH-PERFORMANCE SIMULATOR ---
function fastSimulate(race: PrecomputedRace, p: ReturnType<typeof decodeParameters>): string[] {
    const results = [];

    // Temp factor is constant per race
    const tempFactor = Math.pow(race.temp / p.temp_scale, p.temp_power);

    for (const d of race.drivers) {
        let time = race.baseTimeTotal + d.pitPenalty;

        for (const stint of d.stints) {
            let speed = 0, grace = 0, wear = 0;
            if (stint.tire === 'SOFT') { speed = 0; grace = p.soft_grace; wear = p.soft_wear; }
            else if (stint.tire === 'MEDIUM') { speed = p.med_speed; grace = p.med_grace; wear = p.med_wear; }
            else { speed = p.hard_speed; grace = p.hard_grace; wear = p.hard_wear; }

            // Apply base compound penalty
            time += stint.laps * speed;

            // Apply quadratic degradation
            for (let i = 1; i <= stint.laps; i++) {
                const activeLaps = Math.max(0, i - grace);
                if (activeLaps > 0) {
                    time += (activeLaps * activeLaps) * wear * tempFactor;
                }
            }
        }
        results.push({ id: d.id, time });
    }

    results.sort((a, b) => a.time - b.time);
    return results.map(r => r.id);
}

// --- NEW OBJECTIVE FUNCTION ---
function calculateRaceLoss(predicted: string[], actual: string[]): number {
    let posError = 0;
    let invError = 0;

    for (let i = 0; i < 20; i++) {
        const p1 = predicted[i]!;
        const actualIdx1 = actual.indexOf(p1);
        posError += Math.abs(i - actualIdx1);

        // Pairwise inversion checking
        for (let j = i + 1; j < 20; j++) {
            const p2 = predicted[j]!;
            const actualIdx2 = actual.indexOf(p2);
            if (actualIdx1 > actualIdx2) invError++;
        }
    }
    return posError + 0.5 * invError;
}

function evaluateDataset(races: PrecomputedRace[], vector: number[]): number {
    const params = decodeParameters(vector);
    let totalLoss = 0;
    for (const race of races) {
        const predicted = fastSimulate(race, params);
        totalLoss += calculateRaceLoss(predicted, race.actualPositions);
    }
    return totalLoss / races.length; // Mean loss
}

// --- DATA LOADER ---
function loadData() {
    console.log("Loading dataset shards...");
    let allRaces: RaceRecord[] = [];

    // Load the first 3 shards (3,000 races total) to prevent RAM overload while ensuring diversity
    const files = ['races_00000-00999.json', 'races_01000-01999.json', 'races_02000-02999.json'];
    for (const file of files) {
        const raw = fs.readFileSync(path.join(__dirname, '../data/historical_races', file), 'utf8');
        allRaces = allRaces.concat(JSON.parse(raw));
    }

    // Shuffle and split
    allRaces.sort(() => Math.random() - 0.5);
    const precomputed = precomputeRaces(allRaces);

    return {
        train: precomputed.slice(0, 2000),
        val: precomputed.slice(2000, 2500)
    };
}

// --- THE TWO-STAGE ALGORITHM ---
function runOptimizer() {
    const data = loadData();
    console.log(`Prepared ${data.train.length} training races and ${data.val.length} validation races.`);

    // --- STAGE A: GLOBAL EXPLORATION ---
    console.log("\n--- STAGE A: Global Exploration ---");
    const GLOBAL_SAMPLES = 5000;
    let candidates: { vector: number[], loss: number }[] = [];

    for (let i = 0; i < GLOBAL_SAMPLES; i++) {
        // Sample in log-space/sigmoid bounds (-3 to 3 is a solid range)
        const vector = Array.from({ length: 10 }, () => (Math.random() - 0.5) * 6);
        const loss = evaluateDataset(data.train, vector);
        candidates.push({ vector, loss });

        if (i % 1000 === 0) process.stdout.write(`Sampled ${i} vectors...\r`);
    }

    candidates.sort((a, b) => a.loss - b.loss);
    const topCandidates = candidates.slice(0, 25); // Keep top 25
    console.log(`Global Search Complete. Best initial loss: ${topCandidates[0]!.loss.toFixed(2)}`);

    // --- STAGE B: LOCAL REFINEMENT ---
    console.log("\n--- STAGE B: Local Refinement (Adaptive Hill Climb) ---");
    let globalBestVector = topCandidates[0]!.vector;
    let globalBestLoss = topCandidates[0]!.loss;

    for (let c = 0; c < topCandidates.length; c++) {
        let currentVector = [...topCandidates[c]!.vector];
        let currentLoss = topCandidates[c]!.loss;
        let stepSize = 0.1;

        let stalls = 0;

        while (stepSize > 0.0001 && stalls < 50) {
            // Pick a random parameter to mutate
            const paramIdx = Math.floor(Math.random() * 10);
            const direction = Math.random() > 0.5 ? 1 : -1;

            const testVector = [...currentVector];
            testVector[paramIdx] = testVector[paramIdx]! + (stepSize * direction);

            const testLoss = evaluateDataset(data.train, testVector);

            if (testLoss < currentLoss) {
                currentVector = testVector;
                currentLoss = testLoss;
                stepSize *= 1.05; // Slightly accelerate
                stalls = 0;
            } else {
                stalls++;
                if (stalls >= 10) {
                    stepSize *= 0.5; // Shrink step if stuck
                    stalls = 0;
                }
            }
        }

        console.log(`Refined Candidate ${c + 1} -> Loss: ${currentLoss.toFixed(4)}`);
        if (currentLoss < globalBestLoss) {
            globalBestLoss = currentLoss;
            globalBestVector = currentVector;
        }
    }

    // --- STAGE C: MULTI-BATCH VALIDATION ---
    console.log("\n--- STAGE C: Validation Check ---");
    const finalValLoss = evaluateDataset(data.val, globalBestVector);
    console.log(`Final Validation Loss: ${finalValLoss.toFixed(4)}`);

    console.log("\n🏁 CRACKED PARAMETERS (Decoded) 🏁");
    console.log(decodeParameters(globalBestVector));

    if (finalValLoss === 0) {
        console.log("\n🎉 ABSOLUTE PERFECTION. Loss is 0.00! 🎉");
    } else {
        console.log("Keep iterating or increase GLOBAL_SAMPLES if Loss > 0.");
    }
}

runOptimizer();