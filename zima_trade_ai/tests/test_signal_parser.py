"""
Unit tests for Signal Parser: Regex filter, SCAM_EDIT retro-edit detector, and author scoring.
"""
from zima_trade_ai.intelligence.regex_gate import regex_gate
from zima_trade_ai.intelligence.author_scoring import AuthorScoring


def test_regex_gate_filtering():
    # Valid crypto signal
    valid_signal = """
    #SOLUSDT
    LONG Entry: 145.50
    SL: 140.00
    TP1: 155.00
    TP2: 165.00
    """
    passed, reason = regex_gate.filter_message(valid_signal)
    assert passed is True

    # Noise / Chat
    chatter = "Hey guys, what do you think about market today? Looks bullish!"
    passed, reason = regex_gate.filter_message(chatter)
    assert passed is False

    # Spam / Ad
    ad = "Join our VIP channel for 100x signals! Link: t.me/+asdfghjkl"
    passed, reason = regex_gate.filter_message(ad)
    assert passed is False


def test_author_scoring_and_scam_edit():
    scoring = AuthorScoring()
    channel = scoring.get_or_register_channel(12345, "Alpha Crypto")

    assert channel.status == "QUARANTINE"
    assert channel.trust_score == 50.0

    # Normal edit within 60s
    is_scam = scoring.record_edit_event(12345, published_ts=1000, edit_ts=1050)
    assert is_scam is False
    assert channel.trust_score == 50.0

    # Scam edit retroactively edited after 5 minutes (300s > 180s)
    is_scam = scoring.record_edit_event(12345, published_ts=1000, edit_ts=1350)
    assert is_scam is True
    assert channel.trust_score == 15.0  # 50 - 35 = 15
    assert channel.status == "BANNED"   # Trust score dropped < 20
