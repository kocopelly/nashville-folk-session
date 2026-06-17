#!/usr/bin/env python3
"""
Generate FolkFriend contour strings from ABC notation.

Takes the TTA scraper output JSON, runs each ABC through abc2midi,
parses the MIDI, and generates the contour string FolkFriend uses
for live tune matching.

Based on TomWyllie/folkfriend-app-data build pipeline.
"""

import csv
import json
import logging
import math
import os
import string
import subprocess
import sys
import tempfile

logging.basicConfig(level=logging.INFO, format='%(message)s')
log = logging.getLogger(__name__)

# Add local py_midicsv
sys.path.insert(0, os.path.dirname(__file__))
import py_midicsv

# --- FolkFriend config constants ---
MIDI_HIGH = 95  # B6
MIDI_LOW = 48   # C2
MIDI_NUM = MIDI_HIGH - MIDI_LOW + 1  # 48
MIDI_MAP = string.ascii_letters[:MIDI_NUM]

# Path to abc2midi binary
ABC2MIDI = os.environ.get('ABC2MIDI', '/home/node/.openclaw/bin/abc2midi')


class Note:
    def __init__(self, start, end, pitch):
        self._midi_start = start
        self._midi_end = end
        self.pitch = pitch
        self.start = self._midi_start
        self.end = self._midi_end

    def set_tempo(self, tempo):
        us_per_crotchet = 60000000.0 / tempo
        ms_scale_factor = us_per_crotchet / 480000
        self.start = ms_scale_factor * self._midi_start
        self.end = ms_scale_factor * self._midi_end

    @property
    def duration(self):
        return self.end - self.start

    def rel_pitch(self):
        pitch = self.pitch
        while pitch <= MIDI_LOW:
            pitch += 12
        while pitch >= MIDI_HIGH:
            pitch -= 12
        return pitch - MIDI_LOW


def parse_midi_notes(midi_csv_lines):
    """Parse MIDI CSV lines into Note objects."""
    active_notes = {}
    notes = []

    for line in midi_csv_lines:
        parts = line.strip().replace(', ', ',').split(',')
        if len(parts) < 6:
            continue
        
        track, time_str, msg_type = parts[0].strip(), parts[1].strip(), parts[2].strip()
        note_str, velocity = parts[4].strip(), parts[5].strip()

        if not note_str.isdigit():
            continue

        note = int(note_str)
        time_val = int(time_str)

        if msg_type == 'Note_on_c':
            vel = int(velocity)
            if vel > 0:
                if note not in active_notes:
                    active_notes[note] = time_val
            else:
                # velocity 0 = note off
                if note in active_notes:
                    notes.append(Note(start=active_notes.pop(note), end=time_val, pitch=note))
        elif msg_type == 'Note_off_c':
            if note in active_notes:
                notes.append(Note(start=active_notes.pop(note), end=time_val, pitch=note))

    return notes


def notes_to_contour(notes, tempo=125):
    """Convert notes to a FolkFriend contour string."""
    if not notes:
        return ''

    midi_contour = []

    # Compute quaver duration at this tempo
    dummy = Note(0, 240, None)
    dummy.set_tempo(tempo)
    quaver_duration = dummy.duration

    music_time = 0
    output_time = 0

    for note in notes:
        note.set_tempo(tempo)
        music_time += note.duration

        if music_time <= output_time:
            continue

        rel_duration = note.duration / quaver_duration
        if rel_duration == int(rel_duration):
            output_time += note.duration
            midi_contour.extend([note.rel_pitch()] * int(rel_duration))
        elif rel_duration < 1.0:
            output_time += quaver_duration
            midi_contour.append(note.rel_pitch())
        else:
            round_f = math.ceil if music_time > output_time else math.floor
            rounded_int = round_f(rel_duration)
            output_time += rounded_int * quaver_duration
            midi_contour.extend([note.rel_pitch()] * rounded_int)

    return ''.join(MIDI_MAP[n] for n in midi_contour if 0 <= n < MIDI_NUM)


def abc_to_midi_file(abc_text, midi_path):
    """Convert ABC text to a MIDI file using abc2midi."""
    result = subprocess.run(
        [ABC2MIDI, '-', '-quiet', '-silent', '-NGUI', '-o', midi_path],
        input=abc_text.encode('utf-8'),
        capture_output=True,
        timeout=10
    )
    return os.path.exists(midi_path) and os.path.getsize(midi_path) > 0


def generate_contour(setting_id, meter, mode, abc_body):
    """Generate a contour string for a single tune setting."""
    # Build a complete ABC string
    abc_header = [
        'X:1',
        'T:',
        f'M:{meter.strip()}',
        'L:1/8',
        f'K:{mode.strip()}'
    ]
    
    # Clean ABC body
    abc_lines = abc_body.replace('\\', '').replace('\r', '').split('\n')
    # Strip chord symbols in quotes for cleaner MIDI
    cleaned_lines = []
    for line in abc_lines:
        # Remove chord annotations like "G", "D7" etc for MIDI purposes
        import re
        cleaned = re.sub(r'"[^"]*"', '', line)
        cleaned_lines.append(cleaned)
    
    abc_text = '\n'.join(abc_header + cleaned_lines)

    with tempfile.NamedTemporaryFile(suffix='.midi', delete=False) as f:
        midi_path = f.name

    try:
        if not abc_to_midi_file(abc_text, midi_path):
            return None

        # Convert MIDI to CSV
        midi_csv = py_midicsv.midi_to_csv(midi_path)
        
        # Parse notes and generate contour
        notes = parse_midi_notes(midi_csv)
        if not notes:
            return None

        contour = notes_to_contour(notes)
        return contour

    except Exception as e:
        log.warning(f"  Error generating contour for {setting_id}: {e}")
        return None
    finally:
        if os.path.exists(midi_path):
            os.unlink(midi_path)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Generate FolkFriend contours from TTA data')
    parser.add_argument('input', help='Input JSON from tta-scraper.py')
    parser.add_argument('--output', '-o', help='Output JSON with contours (default: overwrite input)')
    args = parser.parse_args()

    with open(args.input) as f:
        data = json.load(f)

    settings = data['settings']
    total = len(settings)
    success = 0
    fail = 0
    empty = 0

    log.info(f"Generating contours for {total} settings...")
    log.info(f"Using abc2midi: {ABC2MIDI}")

    for i, (sid, setting) in enumerate(settings.items()):
        name = setting.get('source_page', sid)
        log.info(f"[{i+1}/{total}] {name}...")

        # Get the key from mode field for ABC K: header
        # FolkFriend mode format: "Dmajor" → K:D (abc2midi infers major)
        # Need to convert back to ABC key signature
        mode = setting.get('mode', 'Cmajor')
        abc_key = mode_to_abc_key(mode)
        
        contour = generate_contour(
            sid,
            setting.get('meter', '4/4'),
            abc_key,
            setting.get('abc', '')
        )

        if contour:
            setting['contour'] = contour
            success += 1
            log.info(f"  ✓ contour: {len(contour)} chars")
        elif contour == '':
            setting['contour'] = ''
            empty += 1
            log.info(f"  ⚠ empty contour (no notes?)")
        else:
            setting['contour'] = ''
            fail += 1
            log.info(f"  ✗ failed")

    output_path = args.output or args.input
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    log.info(f"\n=== Contour Generation Complete ===")
    log.info(f"Success: {success}, Empty: {empty}, Failed: {fail}")
    log.info(f"Written to: {output_path}")
    
    # Show sample contours
    log.info(f"\n=== Sample Contours ===")
    for sid, setting in list(settings.items())[:3]:
        c = setting.get('contour', '')
        log.info(f"  {setting.get('source_page', sid)}: {c[:80]}{'...' if len(c) > 80 else ''}")


def mode_to_abc_key(folkfriend_mode):
    """Convert FolkFriend mode string back to ABC K: field.
    
    'Dmajor' → 'D'
    'Aminor' → 'Am'  
    'Gdorian' → 'Gdor'
    'Amixolydian' → 'Amix'
    """
    if not folkfriend_mode:
        return 'C'
    
    mode_suffixes = {
        'major': '',
        'minor': 'm',
        'dorian': 'dor',
        'mixolydian': 'mix',
        'lydian': 'lyd',
        'phrygian': 'phr',
        'locrian': 'loc',
    }
    
    for mode_name, abc_suffix in mode_suffixes.items():
        if folkfriend_mode.endswith(mode_name):
            key = folkfriend_mode[:-len(mode_name)]
            return f"{key}{abc_suffix}"
    
    # Fallback: just return as-is
    return folkfriend_mode


if __name__ == '__main__':
    main()
