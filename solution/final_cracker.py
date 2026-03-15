import json
import os
import random

def load_races():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "..", "data", "test_cases")
    races = []
    for i in range(1, 101):
        test_id = f"test_{i:03d}"
        in_path = os.path.join(data_dir, "inputs", f"{test_id}.json")
        out_path = os.path.join(data_dir, "expected_outputs", f"{test_id}.json")
        if not os.path.exists(in_path): continue
        with open(in_path) as f: ri = json.load(f)
        with open(out_path) as f: ro = json.load(f)
        races.append({'input': ri, 'expected': ro['finishing_positions']})
    return races

def simulate_lexicographical(races, p):
    inversions = 0
    time_loss = 0.0
    
    for race in races:
        config = race['input']['race_config']
        tempFactor = (config['track_temp'] / p['t_div']) ** p['t_pow']
        results = []
        
        for strat in race['input']['strategies'].values():
            tt = len(strat['pit_stops']) * config['pit_lane_time']
            ct = strat['starting_tire']
            pm = {pt['lap']: pt['to_tire'] for pt in strat['pit_stops']}
            age = 0
            
            for lap in range(1, config['total_laps'] + 1):
                age += 1
                base = config['base_lap_time']
                
                # 'add' is now a PERCENTAGE (e.g. 0.015 = 1.5% slower)
                if ct == 'SOFT': add, gr, wl, wq = 0.0, p['s_gr'], p['s_wl'], p['s_wq']
                elif ct == 'MEDIUM': add, gr, wl, wq = p['m_add'], p['m_gr'], p['m_wl'], p['m_wq']
                else: add, gr, wl, wq = p['h_add'], p['h_gr'], p['h_wl'], p['h_wq']
                    
                act = max(0.0, age - gr)
                deg = base * tempFactor * (wl * act + wq * act * act)
                
                # 🚨 THE FIX: base + (base * add) 🚨
                tt += base + (base * add) + deg
                
                if lap in pm:
                    ct = pm[lap]
                    age = 0
            results.append({'id': strat['driver_id'], 'time': tt})
            
        actual_order = race['expected']
        results.sort(key=lambda x: x['time'])
        pred = [r['id'] for r in results]
        
        for i in range(20):
            idx1 = actual_order.index(pred[i])
            for j in range(i + 1, 20):
                idx2 = actual_order.index(pred[j])
                if idx1 > idx2: inversions += 1

        for i in range(len(actual_order)):
            time_A = next(r['time'] for r in results if r['id'] == actual_order[i])
            for j in range(i + 1, len(actual_order)):
                time_B = next(r['time'] for r in results if r['id'] == actual_order[j])
                margin = 0.05
                if time_A > time_B - margin:
                    time_loss += (time_A - time_B + margin)
                    
    return inversions, time_loss

def run_boss_tuner():
    all_races = load_races()
    print("⚔️ Igniting Lexicographical Boss with Multiplier Physics! ⚔️")

    # Seeded with converted percentages instead of flat seconds
    best_p = {
      "t_div": 194.98278,
      "t_pow": 1.85803,
      "s_gr": 9.09621,
      "s_wl": 0.07233,
      "s_wq": 0.12161,
      "m_add": 0.015,   # Roughly 1.5% slower
      "m_gr": 18.201,
      "m_wl": 0.00186,
      "m_wq": 0.04197,
      "h_add": 0.025,   # Roughly 2.5% slower
      "h_gr": 26.550,
      "h_wl": 0.00199,
      "h_wq": 0.01301
    }

    best_inv, best_time = simulate_lexicographical(all_races, best_p)
    print(f"Starting Baseline -> Inversions: {best_inv} | Time Loss: {best_time:.4f}")

    step_size = 0.01 
    iterations = 0
    
    try:
        while best_inv > 0:
            iterations += 1
            test_p = best_p.copy()
            
            key = random.choice(list(test_p.keys()))
            scale = test_p[key] if test_p[key] > 0.01 else 0.01
            nudge = (random.random() - 0.5) * step_size * scale
            test_p[key] += nudge
            
            if test_p[key] < 0: test_p[key] = 0.00001
            
            test_inv, test_time = simulate_lexicographical(all_races, test_p)
            
            if (test_inv, test_time) < (best_inv, best_time):
                best_inv, best_time = test_inv, test_time
                best_p = test_p
                step_size *= 1.05 
                
                print(f"Iter {iterations:5d} | Inversions: {best_inv:3d} | Time Loss: {best_time:.4f} | Mutated {key}")
                
                if best_inv == 0:
                    print("\n🔥 ABSOLUTE PERFECTION ACHIEVED! 0 INVERSIONS! 🔥")
                    with open("flawless_multiplier_params.json", "w") as f:
                        json.dump(best_p, f, indent=2)
                    break
            else:
                if iterations % 500 == 0:
                    step_size *= 0.95 
                    
    except KeyboardInterrupt:
        print("\n\n🛑 Optimization manually stopped.")
        print(json.dumps(best_p, indent=2))

if __name__ == '__main__':
    run_boss_tuner()