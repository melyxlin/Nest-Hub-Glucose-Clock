import time
import unittest

from server import normalize_entry, range_for_glucose, select_previous_entry


class GlucoseClockTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            "low_threshold": 70,
            "high_threshold": 180,
            "stale_after_minutes": 10,
            "poll_seconds": 60,
            "units": "mg/dL",
            "low_alert_sound": True,
            "high_alert_sound": True,
        }

    def test_ranges(self):
        self.assertEqual("low", range_for_glucose(69, 70, 180))
        self.assertEqual("in-range", range_for_glucose(70, 70, 180))
        self.assertEqual("in-range", range_for_glucose(180, 70, 180))
        self.assertEqual("high", range_for_glucose(181, 70, 180))

    def test_current_reading(self):
        result = normalize_entry(
            {"sgv": 112, "direction": "Flat", "date": time.time() * 1000},
            self.config,
        )
        self.assertEqual(112, result["value"])
        self.assertEqual("→", result["arrow"])
        self.assertEqual("in-range", result["range"])
        self.assertFalse(result["stale"])
        self.assertIsNone(result["delta"])
        self.assertTrue(result["low_alert_sound"])
        self.assertTrue(result["high_alert_sound"])

    def test_delta_from_prior_reading(self):
        now = time.time() * 1000
        result = normalize_entry(
            {"sgv": 87, "direction": "Flat", "date": now},
            {**self.config},
            {"sgv": 80, "date": now - 5 * 60 * 1000},
        )
        self.assertEqual(7, result["delta"])
        self.assertEqual("+7", result["delta_display"])
        self.assertEqual("→", result["arrow"])

    def test_duplicate_sources_are_skipped_for_delta(self):
        now = time.time() * 1000
        entries = [
            {"sgv": 79, "date": now, "device": "Dexcom G7"},
            {"sgv": 79, "date": now - 8 * 1000, "device": "share2"},
            {"sgv": 82, "date": now - 4 * 60 * 1000 - 52 * 1000, "device": "share2"},
            {"sgv": 82, "date": now - 5 * 60 * 1000, "device": "Dexcom G7"},
        ]

        previous = select_previous_entry(entries)
        result = normalize_entry(entries[0], self.config, previous)

        self.assertEqual("Dexcom G7", previous["device"])
        self.assertEqual(-3, result["delta"])
        self.assertEqual("-3", result["delta_display"])

    def test_duplicate_source_fallback_when_same_device_is_missing(self):
        now = time.time() * 1000
        entries = [
            {"sgv": 79, "date": now, "device": "Dexcom G7"},
            {"sgv": 79, "date": now - 8 * 1000, "device": "share2"},
            {"sgv": 82, "date": now - 5 * 60 * 1000, "device": "share2"},
        ]

        previous = select_previous_entry(entries)
        result = normalize_entry(entries[0], self.config, previous)

        self.assertEqual("share2", previous["device"])
        self.assertEqual(-3, result["delta"])

    def test_delta_omitted_when_prior_reading_is_too_old(self):
        now = time.time() * 1000
        result = normalize_entry(
            {"sgv": 87, "direction": "Flat", "date": now},
            {**self.config},
            {"sgv": 80, "date": now - 11 * 60 * 1000},
        )
        self.assertIsNone(result["delta"])

    def test_stale_reading(self):
        result = normalize_entry(
            {"sgv": 112, "direction": "Flat", "date": (time.time() - 601) * 1000},
            self.config,
        )
        self.assertTrue(result["stale"])


if __name__ == "__main__":
    unittest.main()
