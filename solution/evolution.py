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

def simulate(races, p):
    inversions = 0
    
    for race in races:
        config = race['input']['race_config']
        tempFactor = (config['track_temp'] / p['t_div']) ** p['t_pow']
        results = []
        
        for strat in race['input']['strategies'].values():
            tt = len(strat['pit_stops']) * config['pit_lane_time']
            ct = strat['starting_tire']
            pm = {pt['lap']: pt['to_tire'] for pt in strat['pit_stops']}
            
            # 🚨 NEW REALITY: Tire age starts at -1 🚨
            age = -1 
            
            for lap in range(1, config['total_laps'] + 1):
                age += 1
                base = config['base_lap_time']
                
                if ct == 'SOFT': add, gr, wr, exp = 0.0, p['s_gr'], p['s_wr'], p['s_exp']
                elif ct == 'MEDIUM': add, gr, wr, exp = p['m_add'], p['m_gr'], p['m_wr'], p['m_exp']
                else: add, gr, wr, exp = p['h_add'], p['h_gr'], p['h_wr'], p['h_exp']
                    
                act = max(0.0, age - gr)
                deg = base * tempFactor * wr * (act ** exp)
                
                tt += base + add + deg
                
                if lap in pm:
                    ct = pm[lap]
                    age = -1 # 🚨 NEW REALITY: Reset to -1 on pit stop 🚨
                    
            results.append({'id': strat['driver_id'], 'time': tt})
            
        results.sort(key=lambda x: x['time'])
        pred = [r['id'] for r in results]
        actual = race['expected']
        
        for i in range(20):
            idx1 = actual.index(pred[i])
            for j in range(i + 1, 20):
                idx2 = actual.index(pred[j])
                if idx1 > idx2:
                    inversions += 1
                    
    return inversions

def create_individual():
    # Randomly spawn a completely new mathematical formula
    return {
        't_div': random.uniform(50, 200),
        't_pow': random.uniform(0.5, 3.0),
        's_gr': random.uniform(5, 12), 's_wr': random.uniform(0.01, 0.2), 's_exp': random.uniform(1.0, 2.5),
        'm_add': random.uniform(0.5, 1.5), 'm_gr': random.uniform(12, 22), 'm_wr': random.uniform(0.005, 0.1), 'm_exp': random.uniform(1.0, 2.5),
        'h_add': random.uniform(1.5, 3.0), 'h_gr': random.uniform(20, 30), 'h_wr': random.uniform(0.0001, 0.05), 'h_exp': random.uniform(1.0, 2.5)
    }

def mutate(p, mutation_rate=0.1):
    mutant = p.copy()
    for key in mutant:
        if random.random() < mutation_rate:
            mutant[key] += random.gauss(0, mutant[key] * 0.1) # 10% variance nudge
            if mutant[key] < 0.0001: mutant[key] = 0.0001
    return mutant

def crossover(p1, p2):
    child = {}
    for key in p1:
        # 50/50 chance to take gene from parent 1 or parent 2
        child[key] = p1[key] if random.random() > 0.5 else p2[key]
    return child

def run_evolution():
    races = load_races()
    POP_SIZE = 100
    GENERATIONS = 1000
    
    print(f"Igniting Genetic Evolution. Population: {POP_SIZE} | Target: 0 Inversions")
    
    # Seed population with our best 30/100 guess + 99 random mutants
    seed = {
        't_div': 145.4, 't_pow': 2.38,
        's_gr': 8.9, 's_wr': 0.17, 's_exp': 1.8,
        'm_add': 1.17, 'm_gr': 18.2, 'm_wr': 0.06, 'm_exp': 1.8,
        'h_add': 2.08, 'h_gr': 24.9, 'h_wr': 0.01, 'h_exp': 1.8
    }
    
    population = [seed] + [create_individual() for _ in range(POP_SIZE - 1)]
    best_all_time_loss = float('inf')
    best_all_time_model = None

    try:
        for gen in range(1, GENERATIONS + 1):
            # 1. Evaluate Fitness
            scored = [(p, simulate(races, p)) for p in population]
            scored.sort(key=lambda x: x[1]) # Sort by lowest inversions
            
            best_gen_loss = scored[0][1]
            if best_gen_loss < best_all_time_loss:
                best_all_time_loss = best_gen_loss
                best_all_time_model = scored[0][0]
                print(f"\n🧬 Gen {gen:3d} | New Best Record! Inversions: {best_all_time_loss}")
                with open("best_f1_dna.json", "w") as f:
                    json.dump(best_all_time_model, f, indent=2)
                
                if best_all_time_loss == 0:
                    print("🏆 ABSOLUTE PERFECTION! 0 INVERSIONS! 🏆")
                    break

            print(f"\rGeneration {gen:3d} | Best Inversions this gen: {best_gen_loss} | All-time best: {best_all_time_loss}", end="")

            # 2. Selection (Top 20% survive)
            survivors = [x[0] for x in scored[:int(POP_SIZE * 0.2)]]
            
            # 3. Breed & Mutate Next Generation
            next_gen = survivors.copy()
            while len(next_gen) < POP_SIZE:
                p1 = random.choice(survivors)
                p2 = random.choice(survivors)
                child = crossover(p1, p2)
                child = mutate(child, mutation_rate=0.3)
                next_gen.append(child)
                
            population = next_gen

    except KeyboardInterrupt:
        print("\n\n🛑 Evolution interrupted.")
        print("Best DNA sequence found:")
        print(json.dumps(best_all_time_model, indent=2))

if __name__ == '__main__':
    run_evolution()