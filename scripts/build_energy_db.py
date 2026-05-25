# READY REPLACE VERSION
# build_energy_db.py
#
# IMPORTANT FIX:
# - blank RAW => use previous RAW
# - RAW = 0 => use previous RAW
# - same RAW => usage = 0
# - NEVER use current RAW directly as usage
# - reset logic only when current << previous

EPSILON = 0.000001

def safe_current_reading(raw_value, previous_value):
    if raw_value is None:
        return previous_value

    text = str(raw_value).strip()

    if text == "":
        return previous_value

    try:
        value = float(text)
    except:
        return previous_value

    # IMPORTANT:
    # zero means "not recorded"
    if value == 0:
        return previous_value

    return value


def calculate_usage(previous_kwh, raw_reading, flags=None):
    if flags is None:
        flags = []

    current_kwh = safe_current_reading(raw_reading, previous_kwh)

    # NORMAL
    usage_kwh = current_kwh - previous_kwh

    # SAME VALUE
    if abs(current_kwh - previous_kwh) < EPSILON:
        usage_kwh = 0
        flags.append("UNCHANGED_READING_USAGE_ZERO")

    # NEGATIVE
    elif usage_kwh < 0:

        reset_ratio = previous_kwh / max(current_kwh, 1)

        # TRUE RESET
        if reset_ratio >= 100:
            usage_kwh = current_kwh
            flags.append("METER_RESET_DETECTED")

        else:
            usage_kwh = 0
            flags.append("NEGATIVE_DELTA_INVALID")

    # SAFETY
    if usage_kwh < 0:
        usage_kwh = 0

    return usage_kwh, current_kwh, flags


# ---------------------------------------------------------
# EXAMPLE
#
# W14 = 26864
# W15 = 26864
# W16 = blank
#
# current = previous = 26864
# usage = 26864 - 26864 = 0
#
# RESULT = 0
# ---------------------------------------------------------
