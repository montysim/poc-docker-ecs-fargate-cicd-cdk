import src.vsl_poc_movie_client.client_module as client
import time

start_time = time.time()
totalCount = 100
currSuccCount = 0
for i in range(totalCount):
    time.sleep(1)
    try:
        res = client.is_service_up()
        currSuccCount += 1
    except:
        continue
end_time = time.time()
total_time_secs = round(end_time - start_time, 2)
print("Time %f"%total_time_secs)
print("Successful %d / %d"%(currSuccCount, totalCount))