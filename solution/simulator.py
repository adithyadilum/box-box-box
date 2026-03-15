#!/usr/bin/env python3
"""
Box Box Box - F1 Race Simulator
"""

import json
import sys

def simulate_race(input_data):
    results = []
    config = input_data['race_config']
    
    # Evolved Universal Temperature Scaler
    track_temp = float(config['track_temp'])
    tempFactor = (track_temp / 195.19982241364053) ** 1.85803
    
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
            
            compoundAdd = 0.0  # This is now a PERCENTAGE!
            gracePeriod = 0.0
            wearLinear = 0.0
            wearQuadratic = 0.0
            
            # THE LATEST POLYNOMIAL + MULTIPLIER DNA
            if current_tire == 'SOFT':
                compoundAdd = 0.0
                gracePeriod = 8.944250980563016
                wearLinear = 0.07143470925441658
                wearQuadratic = 0.12146750025029442
            elif current_tire == 'MEDIUM':
                compoundAdd = 0.014202672972904534
                gracePeriod = 18.102404866180787
                wearLinear = 0.002092489443579544
                wearQuadratic = 0.04252039815779273
            elif current_tire == 'HARD':
                compoundAdd = 0.02542095642096224
                gracePeriod = 26.2783026670605
                wearLinear = 0.002015721941460836
                wearQuadratic = 0.012780224103650196
            
            active = max(0.0, float(tire_age) - gracePeriod)
            
            # True Polynomial Degradation
            degradationEffect = base * tempFactor * (wearLinear * active + wearQuadratic * active * active)
            
            # The Multiplier Fix: base + (base * percentage)
            total_time += base + (base * compoundAdd) + degradationEffect
            
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
        predicted_positions = simulate_race(race_input)
        
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