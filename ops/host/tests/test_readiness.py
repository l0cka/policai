import unittest
from unittest.mock import Mock, patch

import host


class ReadinessTests(unittest.TestCase):
    def test_transient_runtime_absence_is_retried(self):
        obj = host.Host.__new__(host.Host)
        obj.runtime_ready = Mock(side_effect=[False, False, True])
        with patch.object(host.time, "sleep") as sleep:
            obj.wait_for_runtime({})
        self.assertEqual(obj.runtime_ready.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    def test_wrong_identity_is_not_retried(self):
        obj = host.Host.__new__(host.Host)
        obj.runtime_ready = Mock(side_effect=host.Refused("identity mismatch"))
        with patch.object(host.time, "sleep") as sleep:
            with self.assertRaises(host.Refused):
                obj.wait_for_runtime({})
        sleep.assert_not_called()

    def test_missing_runtime_times_out(self):
        obj = host.Host.__new__(host.Host)
        obj.runtime_ready = Mock(return_value=False)
        with patch.object(host.time, "sleep"):
            with self.assertRaises(host.Refused):
                obj.wait_for_runtime({})
        self.assertEqual(obj.runtime_ready.call_count, 30)
