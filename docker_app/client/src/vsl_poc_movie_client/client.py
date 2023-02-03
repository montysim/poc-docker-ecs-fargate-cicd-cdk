import requests

def is_service_up():
    # url = 'http://localhost:8001'
    url = 'http://internal-Djang-DDEPO-RNDZ91Z4575E-810166248.us-west-2.elb.amazonaws.com:80'
    res = requests.get(url, timeout=1)

    if res.status_code == 200:
        response = 'UP'
        if ('UP and CONNECTED' in res.text):
            response = 'UP and WELL CONNECTED'
        elif ('UP' in res.text):
            response = 'UP and CONNECTED'

        return response
    else:
        raise Exception("Not 200")