import * as fs from 'fs';

interface PitStop { lap: number; from_tire: string; to_tire: string; }
interface DriverStrategy { driver_id: string; starting_tire: string; pit_stops: PitStop[]; }
interface RaceConfig { track: string; total_laps: number; base_lap_time: number; pit_lane_time: number; track_temp: number; }
interface RaceRecord { race_id: string; race_config: RaceConfig; strategies: Record<string, DriverStrategy>; finishing_positions: string[]; }

interface PhysicsModel {
    med_speed: number; hard_speed: number;
    soft_grace: number; med_grace: number; hard_grace: number;
    soft_wear: number; med_wear: number; hard_wear: number;
    isPercentage: boolean; // Does it multiply the base lap time?
    isQuadratic: boolean;  // Do tires fall off a cliff?
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

            let compoundFactor = 0; let gracePeriod = 0; let wearRate = 0;
            if (currentTire === 'SOFT') { compoundFactor = 0; gracePeriod = model.soft_grace; wearRate = model.soft_wear; }
            else if (currentTire === 'MEDIUM') { compoundFactor = model.med_speed; gracePeriod = model.med_grace; wearRate = model.med_wear; }
            else if (currentTire === 'HARD') { compoundFactor = model.hard_speed; gracePeriod = model.hard_grace; wearRate = model.hard_wear; }

            // Apply the genetic structure
            const compoundEffect = model.isPercentage ? (base * compoundFactor) : compoundFactor;

            const activeDegradationLaps = Math.max(0, tireAge - gracePeriod);
            const ageFactor = model.isQuadratic ? Math.pow(activeDegradationLaps, 2) : activeDegradationLaps;

            // Using Temp/100 as a clean normalizer
            let degradationEffect = ageFactor * wearRate * (config.track_temp / 100);
            if (model.isPercentage) degradationEffect *= base;

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

function calculateError(model: PhysicsModel, races: RaceRecord[]): number {
    let totalError = 0;
    for (const race of races) {
        const predicted = simulateRace(race, model);
        const actual = race.finishing_positions;
        for (let i = 0; i < 20; i++) { totalError += Math.abs(i - actual.indexOf(predicted[i]!)); }
    }
    return totalError;
}

// Generate a completely random F1 genome
function randomModel(): PhysicsModel {
    return {
        med_speed: Number((Math.random() * 2).toFixed(3)),
        hard_speed: Number((1 + Math.random() * 2).toFixed(3)),
        soft_grace: Math.floor(Math.random() * 8) + 1,
        med_grace: Math.floor(Math.random() * 8) + 6,
        hard_grace: Math.floor(Math.random() * 8) + 12,
        soft_wear: Number((Math.random() * 0.2).toFixed(4)),
        med_wear: Number((Math.random() * 0.1).toFixed(4)),
        hard_wear: Number((Math.random() * 0.05).toFixed(4)),
        isPercentage: Math.random() > 0.5,
        isQuadratic: Math.random() > 0.5
    };
}

// Cross two parents and mutate slightly
function breed(parentA: PhysicsModel, parentB: PhysicsModel): PhysicsModel {
    const child: any = {};
    for (const key of Object.keys(parentA) as (keyof PhysicsModel)[]) {
        // 50/50 chance to get trait from Mom or Dad
        child[key] = Math.random() > 0.5 ? parentA[key] : parentB[key];

        // 10% Mutation chance
        if (Math.random() < 0.10) {
            if (typeof child[key] === 'boolean') {
                child[key] = !child[key];
            } else if (key.includes('grace')) {
                child[key] = Math.max(0, child[key] + Math.floor((Math.random() - 0.5) * 3));
            } else {
                child[key] = Number((child[key] + (Math.random() - 0.5) * 0.05).toFixed(4));
            }
        }
    }

    // Enforce basic logical rules
    if (child.med_speed >= child.hard_speed) child.hard_speed = child.med_speed + 0.1;
    if (child.soft_grace >= child.med_grace) child.med_grace = child.soft_grace + 1;
    if (child.med_grace >= child.hard_grace) child.hard_grace = child.med_grace + 1;

    return child as PhysicsModel;
}

function runDarwin() {
    console.log("Loading historical races...");
    const rawData = fs.readFileSync('../data/historical_races/races_00000-00999.json', 'utf8');
    const races: RaceRecord[] = JSON.parse(rawData);
    const trainingBatch = races.slice(0, 15); // Train on 15 races

    const POPULATION_SIZE = 150;
    let population: PhysicsModel[] = Array.from({ length: POPULATION_SIZE }, randomModel);

    console.log("Starting Evolutionary Algorithm...");
    let bestError = Infinity;
    let generation = 0;

    while (bestError > 0) {
        generation++;

        // Score everyone
        const scoredPopulation = population.map(model => ({
            model, error: calculateError(model, trainingBatch)
        }));

        // Sort by fittest (lowest error)
        scoredPopulation.sort((a, b) => a.error - b.error);

        if (scoredPopulation[0]!.error < bestError) {
            bestError = scoredPopulation[0]!.error;
            console.log(`\n[Gen ${generation}] Evolution Breakthrough! Error: ${bestError}`);
            console.log(scoredPopulation[0]!.model);

            if (bestError === 0) {
                console.log("\n🧬 BINGO! WE CRACKED THE TRUE GENOME! 🧬");
                break;
            }
        }

        // Keep the top 20% (the elite)
        const elite = scoredPopulation.slice(0, Math.floor(POPULATION_SIZE * 0.2)).map(s => s.model);

        // Breed the rest of the new generation
        population = [...elite];
        while (population.length < POPULATION_SIZE) {
            const dad = elite[Math.floor(Math.random() * elite.length)]!;
            const mom = elite[Math.floor(Math.random() * elite.length)]!;
            population.push(breed(dad, mom));
        }
    }
}

runDarwin();