import numpy as np

from aviator_ml.config import MIN_HISTORY
from aviator_ml.features.engineering import build_feature_frame, build_targets, usable_mask

from .conftest import iid_multipliers


def test_features_never_use_current_or_future_rounds():
    m = iid_multipliers(200, seed=1)
    base = build_feature_frame(m)
    for t in (MIN_HISTORY, 50, 120, 199):
        perturbed = m.copy()
        perturbed[t:] = 1000.0  # change round t and everything after it
        f = build_feature_frame(perturbed)
        np.testing.assert_allclose(base.iloc[: t + 1].to_numpy(), f.iloc[: t + 1].to_numpy(), equal_nan=True)


def test_lag_one_is_previous_round():
    m = np.array([1.0 + i / 10 for i in range(40)])
    f = build_feature_frame(m)
    assert np.isclose(f.loc[30, "lag_log_1"], np.log(m[29]))
    assert np.isclose(f.loc[30, "lag_log_3"], np.log(m[27]))


def test_include_next_row_uses_full_history():
    m = iid_multipliers(60, seed=2)
    f = build_feature_frame(m, include_next=True)
    assert len(f) == 61
    assert np.isclose(f.iloc[-1]["lag_log_1"], np.log(m[-1]))
    assert not f.iloc[-1].isna().any()


def test_usable_rows_have_no_missing_values():
    m = iid_multipliers(100, seed=3)
    f = build_feature_frame(m)
    assert not f[usable_mask(len(f))].isna().any().any()


def test_streak_sign_and_length():
    m = np.array([3.0, 3.0, 1.1, 1.1, 1.1] + [1.5] * 30)
    f = build_feature_frame(m)
    assert f.loc[2, "streak_2x"] == 2  # two >=2x rounds before round 2
    assert f.loc[5, "streak_2x"] == -3


def test_targets():
    y = build_targets([1.0, 1.5, 2.0, 9.99, 10.0])
    assert list(y[1.5]) == [0, 1, 1, 1, 1]
    assert list(y[10.0]) == [0, 0, 0, 0, 1]
