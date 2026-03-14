import * as fs from 'fs';

// --- INTERFACES ---
interface PitStop { lap: number; from_tire: string; to_tire: string; }
interface DriverStrategy { driver_id: string; starting_tire: string; pit_stops: PitStop[]; }
interface RaceConfig { track: string; total_laps: number; base_lap_time: number; pit_lane_time: number; track_temp: number; }
interface RaceRecord { race_id: string; race_config: RaceConfig; strategies: Record<string, DriverStrategy>; finishing_positions: string[]; }

// ==========================================
// 🧪 THE LAB: TWEAK THESE TO HIT 100% ACCURACY
// ==========================================
const TIRE_BASE_SPEED: Record<string, number> = {
    SOFT: 0.0,
    MEDIUM: 0.5, // Try tweaking this...
    HARD: 1.2    // Try tweaking this...
};

function getDegradation(tire: string, age: number, temp: number): number {
    // We need to figure out this exact formula!
    // Is it linear? (age * X)
    // Is it exponential? (age * age * X)
    // How does temp affect it? (temp / 100?)
    const wearRate = tire === 'SOFT' ? 0.06 : tire === 'MEDIUM' ? 0.04 : 0.02;
    return age * wearRate * (temp / 30);
}
// ==========================================

function simulateRace(input: RaceRecord): string[] {
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
            const compoundEffect: number = (TIRE_BASE_SPEED as Record<string, number>)[currentTire] ?? 0;
            const degradationEffect = getDegradation(currentTire, tireAge, config.track_temp);

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

function runAnalyzer() {
    console.log("Loading historical races...");
    // Load the first batch of historical data
    const rawData = fs.readFileSync('../data/historical_races/races_00000-00999.json', 'utf8');
    const races: RaceRecord[] = JSON.parse(rawData);

    let correct = 0;
    const TOTAL_TO_TEST = 100; // Let's test the first 100 to be fast

    console.log(`Testing against ${TOTAL_TO_TEST} races...`);

    for (let i = 0; i < TOTAL_TO_TEST; i++) {
        const race = races[i];
        if (!race) continue;

        const predicted = simulateRace(race);
        const actual = race.finishing_positions;

        // Check if our predicted array exactly matches the actual array
        const isPerfectMatch = predicted.every((driver, idx) => driver === actual[idx]);

        if (isPerfectMatch) {
            correct++;
        }
    }

    console.log(`\n--- RESULTS ---`);
    console.log(`Accuracy: ${((correct / TOTAL_TO_TEST) * 100).toFixed(2)}% (${correct}/${TOTAL_TO_TEST} correct)`);
    console.log(`Keep tweaking the constants until this hits 100%!`);
}

runAnalyzer();