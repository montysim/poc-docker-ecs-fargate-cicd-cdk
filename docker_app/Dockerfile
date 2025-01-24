FROM continuumio/conda-ci-linux-64-python3.8 as base

RUN sudo apt-get --allow-releaseinfo-change update

# Add verisim
RUN sudo groupadd -g 1000 verisim
RUN sudo useradd -g 1000 -u 1000 -s /bin/bash --create-home -p $(openssl passwd -1 verisim) verisim

# Add to sudoers
RUN sudo usermod -aG sudo verisim
RUN echo "verisim  ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/verisim

RUN sudo apt-get update -y
RUN sudo apt-get upgrade -y

RUN sudo apt-get install --yes python3-dev  \
        build-essential pkg-config libcairo2 libcairo2-dev iproute2 vim

RUN alias python=python3

WORKDIR /app
COPY . /app/

RUN sudo chown -R verisim:verisim /opt/conda

# Create conda env
RUN sudo -u verisim /opt/conda/bin/conda update -n base -c defaults conda

# Source conda for init and create env
# RUN sudo -u verisim /opt/conda/bin/conda init bash
RUN sudo -u verisim /opt/conda/bin/conda create --name vsl3.8 python=3.8 --quiet --yes 

SHELL ["conda", "run", "-n", "vsl3.8", "/bin/bash", "-c"]

# RUN sudo -u verisim /opt/conda/bin/conda activate vsl3.8

RUN sudo -u verisim /opt/conda/bin/conda install --name vsl3.8 --yes pip
RUN sudo -u verisim /opt/conda/envs/vsl3.8/bin/pip install --upgrade pip
RUN sudo -u verisim /opt/conda/envs/vsl3.8/bin/pip install Django
RUN sudo -u verisim /opt/conda/envs/vsl3.8/bin/pip install -r /app/requirements.txt

RUN sudo chown -R verisim:verisim /app

FROM base AS tests
RUN sudo -u verisim chmod 777 reports

# Run tests but fail gracefully for export-tests phase
RUN if /opt/conda/envs/vsl3.8/bin/python -m pytest -q --ignore-glob=**client** --junitxml=reports/unittest.xml; then : else echo "Tests failed"; fi
RUN ls reports

FROM scratch AS export-tests
WORKDIR /
COPY --from=tests /app/reports /


# ENTRYPOINT [ "/bin/bash", "-l", "-c" ]

FROM base as prod
ENTRYPOINT ["/opt/conda/envs/vsl3.8/bin/python", "manage.py", "runserver", "0.0.0.0:8001"]
