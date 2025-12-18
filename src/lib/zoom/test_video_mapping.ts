import { VideoMappingConfig } from './videoMappingConfig';

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`❌ FAILED: ${msg}`);
        throw new Error(`❌ FAILED: ${msg}`);
    } else {
        console.log(`✅ ${msg}`);
    }
}

function runTests() {
    console.log("Starting VideoMappingConfig Tests...\n");

    // Case 1: Exact Match (1:1)
    {
        console.log("--- Case 1: 1000x1000 Output, 2000x2000 Input (2x Zoom) ---");
        const config = new VideoMappingConfig(
            { width: 2000, height: 2000 },
            { width: 1000, height: 1000 },
            0
        );

        // Expected: Scale = 2000 / 1000 = 2.
        // Projected Box in Output: Full cover. x=0, y=0, w=1000, h=1000.

        assert(config.projectedBox.scale === 2, "Scale should be 2");
        assert(config.projectedBox.x === 0, "X should be 0");
        assert(config.projectedBox.y === 0, "Y should be 0");
        assert(config.projectedBox.width === 1000, "Width should be 1000");
        assert(config.projectedBox.height === 1000, "Height should be 1000");

        // Point Projection
        // Input (1000, 1000) -> Output (500, 500)
        const p = config.projectInputToOutput({ x: 1000, y: 1000 });
        assert(p.x === 500, "Point X 1000->500");
        assert(p.y === 500, "Point Y 1000->500");
    }

    // Case 2: Letterboxing (Input is wider than Output aspect ratio)
    {
        console.log("\n--- Case 2: Letterboxing (Input 2000x1000, Output 1000x1000) ---");
        const config2 = new VideoMappingConfig(
            { width: 2000, height: 1000 }, // Input (The Wide Recording)
            { width: 1000, height: 1000 }, // Output (The Square Video)
            0
        );
        assert(config2.projectedBox.scale === 2, "Case 2: Scale 2 (Contain)");
        assert(config2.projectedBox.x === 0, "Case 2: X 0");
        assert(config2.projectedBox.y === 250, "Case 2: Y 250");
        assert(config2.projectedBox.width === 1000, "Case 2: Width 1000");
        assert(config2.projectedBox.height === 500, "Case 2: Height 500");
    }

    // Case 3: Padding (10%)
    {
        console.log("\n--- Case 3: Padding 10% (Input 1000x1000, Output 1000x1000) ---");
        const padding = 0.1;
        const config3 = new VideoMappingConfig(
            { width: 1000, height: 1000 },
            { width: 1000, height: 1000 },
            padding
        );

        assert(config3.projectedBox.scale === 1.25, "Case 3: Scale 1.25");
        assert(config3.projectedBox.x === 100, "Case 3: X 100");
        assert(config3.projectedBox.y === 100, "Case 3: Y 100");
        assert(config3.projectedBox.width === 800, "Case 3: Width 800");
    }

    console.log("\n✅ All Tests Passed!");
}

runTests();
