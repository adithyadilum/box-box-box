import json
import os
import simulator  # This imports your simulator.py file directly!

def run_local_tests():
    print("🏁 Starting Local Python Grader 🏁\n")
    passed = 0
    failed = 0

    # Get the absolute path to the data directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "..", "data", "test_cases")

    for i in range(1, 101):
        test_id = f"test_{i:03d}"
        input_path = os.path.join(data_dir, "inputs", f"{test_id}.json")
        expected_path = os.path.join(data_dir, "expected_outputs", f"{test_id}.json")

        if not os.path.exists(input_path) or not os.path.exists(expected_path):
            continue

        with open(input_path, 'r') as f:
            input_data = json.load(f)
        
        with open(expected_path, 'r') as f:
            expected_data = json.load(f)

        expected_positions = expected_data.get("finishing_positions", [])

        try:
            # Run your simulation logic directly in memory!
            actual_positions = simulator.simulate_race(input_data)

            if actual_positions == expected_positions:
                passed += 1
                print(f"\r✅ Passed: {passed}/100...", end="", flush=True)
            else:
                failed += 1
                print(f"\n❌ Failed {test_id.upper()}: Mismatched positions.")
        except Exception as e:
            failed += 1
            print(f"\n⚠️ Error on {test_id.upper()}: {e}")

    print("\n\n========================================")
    if passed == 100:
        print("🏆 100/100 PERFECT SCORE! The physics are mathematically flawless! 🏆")
        print("Ready for official submission!")
    else:
        print(f"Score: {passed}/100 ({failed} failed)")
    print("========================================\n")

if __name__ == '__main__':
    run_local_tests()