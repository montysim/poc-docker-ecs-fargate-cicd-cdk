"""A setuptools based setup module.
See:
https://packaging.python.org/en/latest/distributing.html
"""

from setuptools import setup, find_packages

setup(
    name = 'vsl_poc_movie_client',

    version = '1.0.0',

    description = 'An sample Python package',
    license = 'MIT',
    package_dir = {"": "src"},
    packages = find_packages(
        # includes dirs with __init__.py
        where="./src",
        include="*",
        exclude=[]
    ),
    python_requires = '>=3.6',
    install_requires=[
        # Loosely defined dependencies
        'requests'
    ]
)