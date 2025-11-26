#!/usr/bin/env bash
# Place in .platform/hooks/postdeploy directory
sudo certbot -n -d wardsdairies.us-east-1.elasticbeanstalk.com --nginx --agree-tos --email karlie3@byu.edu
