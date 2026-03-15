"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// --- THE CRACKED PHYSICS ENGINE ---
function simulateRace(input) {
    var results = [];
    var config = input.race_config;
    var tempFactor = Math.pow(config.track_temp / 150.8132862638924, 2.47506290316599);
    for (var _i = 0, _a = Object.values(input.strategies); _i < _a.length; _i++) {
        var strategy = _a[_i];
        var totalTime = 0;
        var currentTire = strategy.starting_tire;
        var tireAge = 0;
        var pitStopsMap = new Map(strategy.pit_stops.map(function (p) { return [p.lap, p.to_tire]; }));
        for (var lap = 1; lap <= config.total_laps; lap++) {
            tireAge++;
            var base = config.base_lap_time;
            // 1. Compound delta = base multiplier + flat additive term
            var compoundMul = 0;
            var compoundAdd = 0;
            var gracePeriod = 0;
            var wearLinear = 0;
            var wearQuadratic = 0;
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
            var active = Math.max(0, tireAge - gracePeriod);
            var degradationEffect = base * tempFactor * (wearLinear * active + wearQuadratic * active * active);
            totalTime += (base + base * compoundMul + compoundAdd + degradationEffect);
            if (pitStopsMap.has(lap)) {
                totalTime += config.pit_lane_time;
                currentTire = pitStopsMap.get(lap);
                tireAge = 0;
            }
        }
        results.push({ driver_id: strategy.driver_id, total_time: totalTime });
    }
    // Sort fastest to slowest
    results.sort(function (a, b) { return a.total_time - b.total_time; });
    return results.map(function (r) { return r.driver_id; });
}
// --- BULLETPROOF IO HANDLER ---
function main() {
    var rawInput = '';
    process.stdin.setEncoding('utf8');
    // Asynchronously read all data from the pipe (safe for Windows/Git Bash)
    process.stdin.on('data', function (chunk) {
        rawInput += chunk;
    });
    // When the pipe closes, parse and simulate
    process.stdin.on('end', function () {
        if (!rawInput.trim())
            return;
        try {
            var raceInput = JSON.parse(rawInput);
            var predictedPositions = simulateRace(raceInput);
            var output = {
                race_id: raceInput.race_id,
                finishing_positions: predictedPositions
            };
            // Output strict JSON for the test runner
            console.log(JSON.stringify(output));
        }
        catch (error) {
            console.error("Error:", error);
            process.exit(1);
        }
    });
}
main();
