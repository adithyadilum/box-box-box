import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function runLocalGrader() {
    console.log("🏁 Starting Local Node.js Grader 🏁\n");
    let passed = 0;
    let failed = 0;

    // Guaranteed exact path to your compiled simulator
    const simulatorPath = path.join(__dirname, 'simulator.js');

    for (let i = 1; i <= 100; i++) {
        const testId = i.toString().padStart(3, '0');
        const inputPath = path.join(__dirname, `../data/test_cases/inputs/test_${testId}.json`);
        const expectedPath = path.join(__dirname, `../data/test_cases/expected_outputs/test_${testId}.json`);

        if (!fs.existsSync(inputPath)) continue;

        try {
            const expectedData = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
            const expectedPositions = expectedData.finishing_positions;

            // 🚨 THE FIX: Read the file into memory to bypass Windows shell redirection 🚨
            const inputJson = fs.readFileSync(inputPath, 'utf8');

            // Pass the input data directly into the process
            const rawOutput = execSync(`node "${simulatorPath}"`, {
                input: inputJson,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });

            const actualData = JSON.parse(rawOutput);
            const actualPositions = actualData.finishing_positions;

            const isPerfectMatch = actualPositions.every((driver: string, index: number) => driver === expectedPositions[index]);

            if (isPerfectMatch) {
                passed++;
                process.stdout.write(`\r✅ Passed: ${passed}/100...`);
            } else {
                failed++;
                console.log(`\n❌ Failed TEST_${testId}: Mismatched positions.`);
            }

        } catch (error) {
            failed++;
            console.log(`\n⚠️ Error on TEST_${testId}: Could not execute or parse output.`);
        }
    }

    console.log("\n\n========================================");
    if (passed === 100) {
        console.log("🏆 100/100 PERFECT SCORE! You have beaten the engine! 🏆");
        console.log("Ready for official submission!");
    } else {
        console.log(`Score: ${passed}/100 (${failed} failed)`);
    }
    console.log("========================================\n");
}

runLocalGrader();