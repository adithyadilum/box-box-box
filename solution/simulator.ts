import * as fs from 'fs';

// --- INTERFACES ---
interface PitStop { lap: number; from_tire: string; to_tire: string; }
interface DriverStrategy { driver_id: string; starting_tire: string; pit_stops: PitStop[]; }
interface RaceConfig { track: string; total_laps: number; base_lap_time: number; pit_lane_time: number; track_temp: number; }
interface RaceInput { race_id: string; race_config: RaceConfig; strategies: Record<string, DriverStrategy>; }

// --- THE CRACKED PHYSICS ENGINE ---
function simulateRace(input: RaceInput): string[] {
    const results: { driver_id: string; total_time: number }[] = [];
    const config = input.race_config;
    const tempFactor = Math.pow(config.track_temp / 150.8132862638924, 2.47506290316599);

    for (const strategy of Object.values(input.strategies)) {
        let totalTime = 0;
        let currentTire = strategy.starting_tire;
        let tireAge = 0;
        const pitStopsMap = new Map(strategy.pit_stops.map(p => [p.lap, p.to_tire]));

        for (let lap = 1; lap <= config.total_laps; lap++) {
            tireAge++;
            const base = config.base_lap_time;

            // 1. Compound delta = base multiplier + flat additive term
            let compoundMul = 0;
            let compoundAdd = 0;
            let gracePeriod = 0;
            let wearLinear = 0;
            let wearQuadratic = 0;

            if (currentTire === 'SOFT') {
                gracePeriod = 9;
                wearLinear = 0.17509805195891875;
                wearQuadratic = 0.14105478480547562;
            }
            else if (currentTire === 'MEDIUM') {
                compoundMul = 0.0;
                compoundAdd = 1.198434705887706;
                gracePeriod = 18;
                wearLinear = 0.0938355985121269;
                wearQuadratic = 0.04465995039073968;
            }
            else if (currentTire === 'HARD') {
                compoundMul = 0.0;
                compoundAdd = 2.1392406795402485;
                gracePeriod = 23;
                wearLinear = 0.005766658808506983;
                wearQuadratic = 0.009005827722673117;
            }

            const active = Math.max(0, tireAge - gracePeriod);
            const degradationEffect = base * tempFactor * (wearLinear * active + wearQuadratic * active * active);

            totalTime += (base + base * compoundMul + compoundAdd + degradationEffect);

            if (pitStopsMap.has(lap)) {
                totalTime += config.pit_lane_time;
                currentTire = pitStopsMap.get(lap)!;
                tireAge = 0;
            }
        }
        results.push({ driver_id: strategy.driver_id, total_time: totalTime });
    }

    // Sort fastest to slowest
    results.sort((a, b) => a.total_time - b.total_time);
    return results.map(r => r.driver_id);
}

// --- BULLETPROOF IO HANDLER ---
function main() {
    let rawInput = '';
    process.stdin.setEncoding('utf8');

    // Asynchronously read all data from the pipe (safe for Windows/Git Bash)
    process.stdin.on('data', (chunk) => {
        rawInput += chunk;
    });

    // When the pipe closes, parse and simulate
    process.stdin.on('end', () => {
        if (!rawInput.trim()) return;
        try {
            const raceInput: RaceInput = JSON.parse(rawInput);
            const predictedPositions = simulateRace(raceInput);

            const output = {
                race_id: raceInput.race_id,
                finishing_positions: predictedPositions
            };

            // Output strict JSON for the test runner
            console.log(JSON.stringify(output));
        } catch (error) {
            console.error("Error:", error);
            process.exit(1);
        }
    });
}

main();