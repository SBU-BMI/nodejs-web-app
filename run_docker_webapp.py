#!/usr/bin/env python
# Build and start.
# ex: python run_docker_webapp.py -m 172.17.0.1 -p 27015 -w 3000

import sys
import getopt
import subprocess
import os
import pwd


def usage():
    print '\nUsage: ' + sys.argv[0] + ' -m <mongohost> -p <mongoport> -w <webport>\n'


def get_username():
    return pwd.getpwuid(os.getuid())[0]


def main(argv):
    mongohost = ''
    mongoport = ''
    webport = ''
    try:
        opts, args = getopt.getopt(argv, "hm:p:w:", ["mongohost=", "mongoport=", "webport="])
    except getopt.GetoptError:
        usage()
        sys.exit(2)
    for opt, arg in opts:
        if opt == '-h':
            usage()
            sys.exit()
        elif opt in ("-m", "--mongohost"):
            mongohost = arg
        elif opt in ("-p", "--mongoport"):
            mongoport = arg
        elif opt in ("-w", "--webport"):
            webport = arg

    print 'mongohost is ', mongohost
    print 'mongoport is ', mongoport
    print 'webport is ', webport

    if webport == '' and mongoport == '' and mongohost == '':
        usage()
        sys.exit()

    run_cmd = "docker build --tag sbubmi/nodejs-webapp ."
    subprocess.call(run_cmd, shell=True)

    user = get_username()
    run_cmd = "docker run -v /var/run/docker.sock:/var/run/docker.sock -e MONHOST=" + mongohost + " -e MONPORT=" + mongoport + " -e WEBPORT=" + webport + " -p " + webport + ":3000 --name " + user + "-nodejs-webapp -d sbubmi/nodejs-webapp"
    subprocess.call(run_cmd, shell=True)


if __name__ == "__main__":
    main(sys.argv[1:])
