import * as fs from 'fs';
import * as path from 'path';

interface PitStop { lap: number; from_tire: string; to_tire: string; }
interface DriverStrategy { driver_id: string; starting_tire: string; pit_stops: PitStop[]; }
interface RaceConfig { track: string; total_laps: number; base_lap_time: number; pit_lane_time: number; track_temp: number; }
interface RaceRecord { race_id: string; race_config: RaceConfig; strategies: Record<string, DriverStrategy>; finishing_positions: string[]; }

type Tire = 'SOFT' | 'MEDIUM' | 'HARD';

interface Stint { tire: Tire; laps: number; baseLapTime: number; }
interface PrecomputedDriver { id: string; pitPenalty: number; stints: Stint[]; }
interface PrecomputedRace { id: string; temp: number; drivers: PrecomputedDriver[]; actualPositions: string[]; }

interface Model {
    med_mul: number;
    hard_mul: number;
    med_add: number;
    hard_add: number;

    soft_grace: number;
    med_grace: number;
    hard_grace: number;

    soft_w1: number;
    med_w1: number;
    hard_w1: number;

    soft_w2: number;
    med_w2: number;
    hard_w2: number;

    temp_scale: number;
    temp_power: number;
}

interface Score {
    exactMatches: number;
    posError: number;
}

function randomIn(min: number, max: number): number {
    return min + (max - min) * Math.random();
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function precomputeRaces(rawRaces: RaceRecord[]): PrecomputedRace[] {
    return rawRaces.map((race) => {
        const config = race.race_config;
        const drivers: PrecomputedDriver[] = [];

        for (const strategy of Object.values(race.strategies)) {
            const pitStops = [...strategy.pit_stops].sort((a, b) => a.lap - b.lap);
            const stints: Stint[] = [];

            let currentLap = 1;
            let currentTire: Tire = strategy.starting_tire as Tire;

            for (const pit of pitStops) {
                const laps = pit.lap - currentLap + 1;
                if (laps > 0) {
                    stints.push({ tire: currentTire, laps, baseLapTime: config.base_lap_time });
                }
                currentTire = pit.to_tire as Tire;
                currentLap = pit.lap + 1;
            }

            if (currentLap <= config.total_laps) {
                stints.push({
                    tire: currentTire,
                    laps: config.total_laps - currentLap + 1,
                    baseLapTime: config.base_lap_time
                });
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
            drivers,
            actualPositions: race.finishing_positions
        };
    });
}

function sumsAfterGrace(laps: number, grace: number): { s1: number; s2: number } {
    const n = Math.max(0, laps - grace);
    const s1 = (n * (n + 1)) / 2;
    const s2 = (n * (n + 1) * (2 * n + 1)) / 6;
    return { s1, s2 };
}

function evaluateRace(race: PrecomputedRace, m: Model): string[] {
    const tempFactor = Math.pow(race.temp / m.temp_scale, m.temp_power);
    const results: { id: string; t: number }[] = [];

    for (const d of race.drivers) {
        let total = d.pitPenalty;

        for (const stint of d.stints) {
            let mul = 0;
            let add = 0;
            let grace = 0;
            let w1 = 0;
            let w2 = 0;

            if (stint.tire === 'SOFT') {
                grace = m.soft_grace;
                w1 = m.soft_w1;
                w2 = m.soft_w2;
            } else if (stint.tire === 'MEDIUM') {
                mul = m.med_mul;
                add = m.med_add;
                grace = m.med_grace;
                w1 = m.med_w1;
                w2 = m.med_w2;
            } else {
                mul = m.hard_mul;
                add = m.hard_add;
                grace = m.hard_grace;
                w1 = m.hard_w1;
                w2 = m.hard_w2;
            }

            const base = stint.baseLapTime;
            total += stint.laps * (base + base * mul + add);

            const { s1, s2 } = sumsAfterGrace(stint.laps, grace);
            total += base * tempFactor * (w1 * s1 + w2 * s2);
        }

        results.push({ id: d.id, t: total });
    }

    results.sort((a, b) => a.t - b.t);
    return results.map((x) => x.id);
}

function calculateScore(races: PrecomputedRace[], m: Model): Score {
    let exactMatches = 0;
    let posError = 0;

    for (const race of races) {
        const pred = evaluateRace(race, m);
        const actual = race.actualPositions;

        let exact = true;
        for (let i = 0; i < 20; i++) {
            if (pred[i] !== actual[i]) exact = false;
            posError += Math.abs(i - actual.indexOf(pred[i]!));
        }
        if (exact) exactMatches++;
    }

    return { exactMatches, posError };
}

function better(a: Score, b: Score): boolean {
    if (a.exactMatches !== b.exactMatches) return a.exactMatches > b.exactMatches;
    return a.posError < b.posError;
}

function seedModel(): Model {
    return {
        med_mul: randomIn(0.0, 0.03),
        hard_mul: randomIn(0.01, 0.06),
        med_add: randomIn(0.0, 1.5),
        hard_add: randomIn(0.0, 3.0),

        soft_grace: Math.round(randomIn(2, 18)),
        med_grace: Math.round(randomIn(8, 28)),
        hard_grace: Math.round(randomIn(12, 36)),

        soft_w1: randomIn(0.0, 0.6),
        med_w1: randomIn(0.0, 0.3),
        hard_w1: randomIn(0.0, 0.15),

        soft_w2: randomIn(0.0, 0.15),
        med_w2: randomIn(0.0, 0.08),
        hard_w2: randomIn(0.0, 0.03),

        temp_scale: randomIn(25, 120),
        temp_power: randomIn(0.2, 2.2)
    };
}

function enforce(m: Model): void {
    m.med_mul = clamp(m.med_mul, 0.0, 0.06);
    m.hard_mul = clamp(m.hard_mul, 0.0, 0.09);
    m.med_add = clamp(m.med_add, 0.0, 3.0);
    m.hard_add = clamp(m.hard_add, 0.0, 5.0);

    m.soft_grace = Math.round(clamp(m.soft_grace, 0, 25));
    m.med_grace = Math.round(clamp(m.med_grace, 1, 35));
    m.hard_grace = Math.round(clamp(m.hard_grace, 2, 45));

    if (m.soft_grace >= m.med_grace) m.med_grace = m.soft_grace + 1;
    if (m.med_grace >= m.hard_grace) m.hard_grace = m.med_grace + 1;

    m.soft_w1 = clamp(m.soft_w1, 0.0, 1.0);
    m.med_w1 = clamp(m.med_w1, 0.0, 0.6);
    m.hard_w1 = clamp(m.hard_w1, 0.0, 0.3);

    m.soft_w2 = clamp(m.soft_w2, 0.0, 0.3);
    m.med_w2 = clamp(m.med_w2, 0.0, 0.2);
    m.hard_w2 = clamp(m.hard_w2, 0.0, 0.1);

    if (m.soft_w1 < m.med_w1) m.soft_w1 = m.med_w1;
    if (m.med_w1 < m.hard_w1) m.med_w1 = m.hard_w1;

    if (m.soft_w2 < m.med_w2) m.soft_w2 = m.med_w2;
    if (m.med_w2 < m.hard_w2) m.med_w2 = m.hard_w2;

    m.temp_scale = clamp(m.temp_scale, 5, 200);
    m.temp_power = clamp(m.temp_power, 0.05, 3.0);
}

function mutate(base: Model, scale: number): Model {
    const m: Model = { ...base };
    const keys = Object.keys(m) as (keyof Model)[];
    const k = keys[Math.floor(Math.random() * keys.length)]!;

    const graceStep = Math.random() < 0.7 ? 1 : 2;

    switch (k) {
        case 'soft_grace':
        case 'med_grace':
        case 'hard_grace':
            m[k] += Math.random() < 0.5 ? -graceStep : graceStep;
            break;
        case 'temp_scale':
            m[k] += randomIn(-10, 10) * scale;
            break;
        case 'temp_power':
            m[k] += randomIn(-0.2, 0.2) * scale;
            break;
        default:
            m[k] += randomIn(-0.1, 0.1) * scale;
            break;
    }

    enforce(m);
    return m;
}

function writeBestModel(m: Model): void {
    const out = path.join(__dirname, 'best_model.json');
    fs.writeFileSync(out, JSON.stringify(m, null, 2));
}

function loadAllTestRaces(): RaceRecord[] {
    const races: RaceRecord[] = [];

    for (let i = 1; i <= 100; i++) {
        const id = i.toString().padStart(3, '0');
        const inputPath = path.join(__dirname, `../data/test_cases/inputs/test_${id}.json`);
        const outPath = path.join(__dirname, `../data/test_cases/expected_outputs/test_${id}.json`);
        if (!fs.existsSync(inputPath) || !fs.existsSync(outPath)) continue;

        const race = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as RaceRecord;
        race.finishing_positions = JSON.parse(fs.readFileSync(outPath, 'utf8')).finishing_positions;
        races.push(race);
    }

    return races;
}

function runOverfitter(): void {
    console.log('Loading visible test set and expected outputs...');
    const races = precomputeRaces(loadAllTestRaces());

    let globalBest = seedModel();
    enforce(globalBest);
    let globalScore = calculateScore(races, globalBest);

    const restarts = 35;
    const itersPerRestart = 12000;

    console.log('Starting multi-restart annealed local search...');

    for (let r = 1; r <= restarts; r++) {
        let current = seedModel();
        enforce(current);
        let currentScore = calculateScore(races, current);

        let localBest = current;
        let localScore = currentScore;

        let temperature = 1.0;
        let scale = 1.0;

        for (let i = 1; i <= itersPerRestart; i++) {
            const trial = mutate(current, scale);
            const trialScore = calculateScore(races, trial);

            const currentCost = (100 - currentScore.exactMatches) * 100000 + currentScore.posError;
            const trialCost = (100 - trialScore.exactMatches) * 100000 + trialScore.posError;

            const delta = trialCost - currentCost;
            const accept = delta <= 0 || Math.random() < Math.exp(-delta / Math.max(1e-9, temperature));

            if (accept) {
                current = trial;
                currentScore = trialScore;
            }

            if (better(trialScore, localScore)) {
                localBest = trial;
                localScore = trialScore;
            }

            if (better(trialScore, globalScore)) {
                globalBest = trial;
                globalScore = trialScore;
                writeBestModel(globalBest);
                console.log(`Global best: exact=${globalScore.exactMatches}/100 posError=${globalScore.posError} at restart=${r} iter=${i}`);
            }

            if (i % 2000 === 0) {
                temperature *= 0.6;
                scale *= 0.85;
            }

            if (globalScore.exactMatches === 100) {
                console.log('Found perfect visible-set model.');
                console.log(JSON.stringify(globalBest, null, 2));
                return;
            }
        }

        if (better(localScore, globalScore)) {
            globalBest = localBest;
            globalScore = localScore;
            writeBestModel(globalBest);
        }

        console.log(`Restart ${r}/${restarts}: best exact=${globalScore.exactMatches}/100 posError=${globalScore.posError}`);
    }

    console.log('Search finished. Best model:');
    console.log(JSON.stringify(globalBest, null, 2));
}

runOverfitter();
