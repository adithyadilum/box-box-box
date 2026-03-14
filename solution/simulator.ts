import * as fs from 'fs';

// --- INTERFACES ---
interface PitStop { lap: number; from_tire: string; to_tire: string; }
interface DriverStrategy { driver_id: string; starting_tire: string; pit_stops: PitStop[]; }
interface RaceConfig { track: string; total_laps: number; base_lap_time: number; pit_lane_time: number; track_temp: number; }
interface RaceInput { race_id: string; race_config: RaceConfig; strategies: Record<string, DriverStrategy>; }

// --- THE SECRET MATH (PLACEHOLDERS) ---
const TIRE_BASE_SPEED: Record<string, number> = {
    SOFT: 0.0,
    MEDIUM: 1.0,
    HARD: 2.0
};

function getDegradation(tire: string, age: number, temp: number): number {
    const wearRate = tire === 'SOFT' ? 0.05 : tire === 'MEDIUM' ? 0.03 : 0.01;
    return age * wearRate * (temp / 30);
}

// --- SIMULATION LOOP ---
function simulateRace(input: RaceInput) {
    const results: { driver_id: string; total_time: number }[] = [];
    const config = input.race_config;

    // FIX: Using Object.values avoids the "possibly undefined" TypeScript error
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

    return {
        race_id: input.race_id,
        finishing_positions: results.map(r => r.driver_id)
    };
}

// --- IO HANDLER ---
function main() {
    try {
        const rawInput = fs.readFileSync(0, 'utf8');
        if (!rawInput.trim()) return;

        const raceInput: RaceInput = JSON.parse(rawInput);
        const result = simulateRace(raceInput);

        console.log(JSON.stringify(result));
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

main();