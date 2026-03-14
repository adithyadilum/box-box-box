import * as fs from 'fs';

// --- INTERFACES ---
interface PitStop { lap: number; from_tire: string; to_tire: string; }
interface DriverStrategy { driver_id: string; starting_tire: string; pit_stops: PitStop[]; }
interface RaceConfig { track: string; total_laps: number; base_lap_time: number; pit_lane_time: number; track_temp: number; }
interface RaceRecord { race_id: string; race_config: RaceConfig; strategies: Record<string, DriverStrategy>; finishing_positions: string[]; }

interface PhysicsModel {
    med_speed: number;
    hard_speed: number;
    soft_wear: number;
    med_wear: number;
    hard_wear: number;
    temp_scale: number;
}

function simulateRace(input: RaceRecord, model: PhysicsModel): string[] {
    const results: { driver_id: string; total_time: number }[] = [];
    const config = input.race_config;

    for (const strategy of Object.values(input.strategies)) {
        let totalTime = 0;
        let currentTire = strategy.starting_tire;
        let tireAge = 0;
        const pitStopsMap = new Map(strategy.pit_stops.map(p => [p.lap, p.to_tire]));

        for (let lap = 1; lap <= config.total_laps; lap++) {
            tireAge++;
            const base = config.base_lap_time;

            let compoundEffect = 0;
            if (currentTire === 'MEDIUM') compoundEffect = model.med_speed;
            if (currentTire === 'HARD') compoundEffect = model.hard_speed;

            let wearRate = model.soft_wear;
            if (currentTire === 'MEDIUM') wearRate = model.med_wear;
            if (currentTire === 'HARD') wearRate = model.hard_wear;

            // Formula: Wear Rate * Tire Age * (Track Temp / Scale)
            const degradationEffect = tireAge * wearRate * (config.track_temp / model.temp_scale);

            totalTime += (base + compoundEffect + degradationEffect);

            if (pitStopsMap.has(lap)) {
                totalTime += config.pit_lane_time;
                currentTire = pitStopsMap.get(lap)!;
                tireAge = 0;
            }
        }
        results.push({ driver_id: strategy.driver_id, total_time: totalTime });
    }

    results.sort((a, b) => a.total_time - b.total_time);
    return results.map(r => r.driver_id);
}

function randomFloat(min: number, max: number, step: number): number {
    const steps = Math.floor((max - min) / step);
    const randStep = Math.floor(Math.random() * (steps + 1));
    return Number((min + randStep * step).toFixed(3));
}

function runTrainer() {
    console.log("Loading historical races for training...");
    const rawData = fs.readFileSync('../data/historical_races/races_00000-00999.json', 'utf8');
    const races: RaceRecord[] = JSON.parse(rawData);

    // Test against just 10 races to iterate extremely quickly
    const trainingBatch = races.slice(0, 10);

    console.log("Starting Proximity Search to crack the F1 physics...");
    let attempts = 0;

    // We want to MINIMIZE this error score. 
    // A perfect score across 10 races is 0.
    let lowestError = Infinity;

    while (attempts < 200000) {
        attempts++;

        const testModel: PhysicsModel = {
            med_speed: randomFloat(0.1, 1.5, 0.05),
            hard_speed: randomFloat(0.5, 2.5, 0.05),
            soft_wear: randomFloat(0.01, 0.15, 0.005),
            med_wear: randomFloat(0.005, 0.10, 0.005),
            hard_wear: randomFloat(0.001, 0.05, 0.005),
            temp_scale: randomFloat(10, 100, 10)
        };

        // Logical constraints
        if (testModel.med_speed >= testModel.hard_speed) continue;
        if (testModel.soft_wear <= testModel.med_wear || testModel.med_wear <= testModel.hard_wear) continue;

        let totalError = 0;
        let isPerfect = true;

        for (const race of trainingBatch) {
            const predicted = simulateRace(race, testModel);
            const actual = race.finishing_positions;

            // Calculate how many positions off each driver is
            let raceError = 0;
            for (let i = 0; i < 20; i++) {
                const driver = predicted[i]!;
                const actualPos = actual.indexOf(driver);
                raceError += Math.abs(i - actualPos);
            }

            totalError += raceError;
            if (raceError !== 0) isPerfect = false;
        }

        if (totalError < lowestError) {
            lowestError = totalError;
            console.log(`\n[Attempt ${attempts}] New Best Found! Total Error Score: ${totalError} (Lower is better)`);
            console.log(testModel);

            if (isPerfect) {
                console.log("\n🏎️ 🏁 BINGO! PERFECT MATH FOUND! 🏁 🏎️");
                break;
            }
        }

        if (attempts % 50000 === 0) {
            console.log(`Searched ${attempts} variations... Current Best Error: ${lowestError}`);
        }
    }
}

runTrainer();