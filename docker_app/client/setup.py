"""A setuptools based setup module.
See:
https://packaging.python.org/en/latest/distributing.html
"""

from setuptools import setup, find_packages

setup(
    name = 'vsl_poc_movie_client',

    version = '1.0.1',

    description = 'An sample Python package',
    license = 'MIT',
    package_dir = {"": "vsl_poc_movie_client"},
    include_package_data=True,
    packages = find_packages(
        # includes dirs with __init__.py
        where="vsl_poc_movie_client",
        # include="*",
        exclude=["tests"]
    ),
    py_modules=[],
    python_requires = '>=3.6',
    install_requires=[
        # Loosely defined dependencies
        'requests'
    ]
)