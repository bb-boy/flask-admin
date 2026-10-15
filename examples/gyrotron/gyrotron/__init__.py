"""Gyrotron run log package."""
def create_app(test_config=None):
    from .webapp import create_app as make_app
    return make_app(test_config)
