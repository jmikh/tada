import { ViewTransform } from './viewTransform';

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`❌ FAILED: ${msg}`);
        throw new Error(`❌ FAILED: ${msg}`);
    } else {
        console.log(`✅ ${msg}`);
    }
}

function runTests() {
    console.log("Starting ViewTransform Tests...\n");

    // Case 1: Exact Match (1:1)
    {
        console.log("--- Case 1: 1000x1000 Output, 2000x2000 Input (2x Zoom/Scale) ---");
        const config = new ViewTransform(
            { width: 2000, height: 2000 },
            { width: 1000, height: 1000 },
            0
        );

        // Content Rect should fill output
        assert(config.contentRect.x === 0, "X should be 0");
        assert(config.contentRect.y === 0, "Y should be 0");
        assert(config.contentRect.width === 1000, "Width should be 1000");
        assert(config.contentRect.height === 1000, "Height should be 1000");

        // Input to Output Mapping
        // Center of input (1000, 1000) should be center of output (500, 500)
        const p = config.inputToOutput({ x: 1000, y: 1000 });
        assert(p.x === 500, `Center X: ${p.x}`);
        assert(p.y === 500, `Center Y: ${p.y}`);

        // Resolve Render Rects (Full View)
        const fullView = { x: 0, y: 0, width: 1000, height: 1000 };
        const rects = config.resolveRenderRects(fullView);
        assert(rects !== null, "Should resolve rects");
        if (rects) {
            assert(rects.destRect.x === 0, "Dest X 0");
            assert(rects.destRect.width === 1000, "Dest Width 1000");
            assert(rects.sourceRect.width === 2000, "Source Width 2000");
        }
    }

    // Case 2: Letterboxing (Input 2000x1000, Output 1000x1000)
    // Input is wider. Should fit width. Scale = 0.5 (Input -> Projected Output)
    // 2000 in -> 1000 out. Scale factor 2x input pixels per output pixel? 
    // Wait, Scale in constructor was `input / output`. 
    // 2000 / 1000 = 2.
    // Projected Width = 2000 / 2 = 1000.
    // Projected Height = 1000 / 2 = 500.
    {
        console.log("--- Case 2: 1000x1000 Output, 2000x1000 Input ---");
        const config2 = new ViewTransform(
            { width: 2000, height: 1000 },
            { width: 1000, height: 1000 },
            0
        );

        assert(config2.contentRect.x === 0, "Case 2: X 0");
        assert(config2.contentRect.y === 250, "Case 2: Y 250");
        assert(config2.contentRect.width === 1000, "Case 2: Width 1000");
        assert(config2.contentRect.height === 500, "Case 2: Height 500");
    }

    // Case 3: Padding (20% padding)
    // Output 1000x1000. Use 80%? 
    // Implementation: output * (1 - 2*padding) = 1000 * 0.6 = 600?
    // Wait logic: (1 - 2 * padding). If padding is 0.1 (10%), then 1 - 0.2 = 0.8.
    // 1000 * 0.8 = 800 available.
    {
        console.log("--- Case 3: Padding ---");
        const config3 = new ViewTransform(
            { width: 1000, height: 1000 },
            { width: 1000, height: 1000 },
            0.1
        );

        // Content should be 800x800, centered.
        // x = (1000 - 800) / 2 = 100.
        assert(config3.contentRect.x === 100, "Case 3: X 100");
        assert(config3.contentRect.y === 100, "Case 3: Y 100");
        assert(config3.contentRect.width === 800, "Case 3: Width 800");
    }

    console.log("\n✅ All Tests Passed!");
}

runTests();
