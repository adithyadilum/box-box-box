#!/usr/bin/env python3
"""
Box Box Box - F1 Race Simulator
"""

import json
import sys

def simulate_race(input_data):
    results = []
    config = input_data['race_config']
    
    # Constants from the optimal model found
    track_temp = float(config['track_temp'])
    tempFactor = (track_temp / 147.8132862638924) ** 2.4760629031659898
    
    for str_key, strategy in input_data['strategies'].items():
        total_time = 0.0
        current_tire = strategy['starting_tire']
        tire_age = 0
        
        pit_stops_map = {p['lap']: p['to_tire'] for p in strategy['pit_stops']}
        
        pit_penalty = len(strategy['pit_stops']) * float(config['pit_lane_time'])
        total_time += pit_penalty
        
        for lap in range(1, int(config['total_laps']) + 1):
            tire_age += 1
            base = float(config['base_lap_time'])
            
            compoundMul = 0.0
            compoundAdd = 0.0
            gracePeriod = 0.0
            wearLinear = 0.0
            wearQuadratic = 0.0
            
            if current_tire == 'SOFT':
                gracePeriod = 9.0
                wearLinear = 0.17409805195891875
                wearQuadratic = 0.1310547848054756
            elif current_tire == 'MEDIUM':
                compoundAdd = 1.202434705887706
                gracePeriod = 18.0
                wearLinear = 0.08433559851212691
                wearQuadratic = 0.04265995039073968
            elif current_tire == 'HARD':
                compoundAdd = 2.137740679540249
                gracePeriod = 24.0
                wearLinear = 0.004766658808506983
                wearQuadratic = 0.009505827722673117
            
            active = max(0.0, float(tire_age) - gracePeriod)
            degradationEffect = base * tempFactor * (wearLinear * active + wearQuadratic * active * active)
            
            total_time += (base + base * compoundMul + compoundAdd + degradationEffect)
            
            if lap in pit_stops_map:
                current_tire = pit_stops_map[lap]
                tire_age = 0
                
        results.append({
            'driver_id': strategy['driver_id'].strip(),
            'total_time': total_time
        })
        
    results.sort(key=lambda x: x['total_time'])
    return [r['driver_id'] for r in results]

def main():
    try:
        race_input = json.load(sys.stdin)
        output = {
            'race_id': race_input['race_id'],
            'finishing_positions': predicted_positions
        }
        print(json.dumps(output))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
