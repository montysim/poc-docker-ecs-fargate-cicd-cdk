import pytest

# Tests POC
def test_successFunc():
    assert successFunc() is 10

def test_throwingFunc():
    with pytest.raises(ValueError):
        throwingFunc()

# def test_failFunc():
#     assert failFunc() is 10


# Helper functions POC
def successFunc(a = 10):
    return a

def failFunc(a = 0):
    return 0

def throwingFunc():
    raise ValueError("Custom error")

