import { calculateZoomSchedule, ViewTransform } from './cameraMotion';
import type { ZoomConfig, UserEvent } from '../types';

function assertStrictEqual(a: any, b: any, msg?: string) {
    if (a !== b) {
        throw new Error(msg || `Expected ${a} === ${b}`);
    }
}

const assert = {
    strictEqual: assertStrictEqual
};

// Setup Scenario based on User Request
// Logic is now Source Space based, so Output Dimensions don't affect the Schedule values.
const outputVideoWidth = 1000;
const outputVideoHeight = 1000;
const inputVideoWidth = 2000;
const inputVideoHeight = 2000;
const zoom = 2;

// Events
const events: UserEvent[] = [
    {
        type: 'click',
        timestamp: 1000,
        x: 0, y: 0,
    },
    {
        type: 'click',
        timestamp: 3000,
        x: inputVideoWidth / 2, y: inputVideoHeight / 2,
    },
    {
        type: 'click',
        timestamp: 5000,
        x: inputVideoWidth, y: inputVideoHeight,
    }
];

function runTest(scenarioName: string) {
    console.log(`\n=== Running Scenario: ${scenarioName} ===`);

    const mappingConfig = new ViewTransform(
        { width: inputVideoWidth, height: inputVideoHeight }, // input
        { width: outputVideoWidth, height: outputVideoHeight }, // output
        0 // Padding irrelevant for Source Calculation
    );

    const config: ZoomConfig = {
        zoomIntensity: zoom,
        zoomDuration: 0,
        zoomOffset: 0
    };

    console.log("Running Zoom Schedule Calculation...");
    const schedule = calculateZoomSchedule(config, mappingConfig, events);

    console.log("--- Generated Schedule ---");
    schedule.forEach((k, i) => {
        console.log(`Motion #${i}: timeOut=${k.timeOutMs}`);
        console.log(`  Target: x=${k.target.x}, y=${k.target.y}, w=${k.target.width}, h=${k.target.height}`);
    });

    console.log("--- Running Assertions ---");

    assert.strictEqual(schedule.length, 3, "Should have 3 motions");

    // Target Box Size Calculation:
    // Input 2000. Zoom 2. Target Size = 1000.
    const expectedSize = 1000;

    // Verify Sizes
    for (let i = 0; i < 3; i++) {
        assert.strictEqual(schedule[i].target.width, expectedSize, `M${i} Width incorrect`);
        assert.strictEqual(schedule[i].target.height, expectedSize, `M${i} Height incorrect`);
    }

    // Motion 0: Click (0,0)
    // Box Center (0,0). TopLeft (-500, -500). Clamped to (0,0).
    assert.strictEqual(schedule[0].target.x, 0, "M0 X incorrect");
    assert.strictEqual(schedule[0].target.y, 0, "M0 Y incorrect");

    // Motion 1: Click (1000, 1000)
    // Box Center (1000,1000). TopLeft (500, 500).
    // Right Edge = 500 + 1000 = 1500 <= 2000. Valid.
    assert.strictEqual(schedule[1].target.x, 500, "M1 X incorrect");
    assert.strictEqual(schedule[1].target.y, 500, "M1 Y incorrect");

    // Motion 2: Click (2000, 2000)
    // Box Center (2000,2000). TopLeft (1500, 1500).
    // Right Edge = 1500 + 1000 = 2500 > 2000.
    // Clamped X = 2000 - 1000 = 1000.
    assert.strictEqual(schedule[2].target.x, 1000, "M2 X incorrect");
    assert.strictEqual(schedule[2].target.y, 1000, "M2 Y incorrect");

    console.log(`✅ Scenario '${scenarioName}' Passed!`);
}

// Run Scenarios
runTest("Standard Zoom");

console.log("\n✅✅ All Scenarios Passed! ✅✅");
