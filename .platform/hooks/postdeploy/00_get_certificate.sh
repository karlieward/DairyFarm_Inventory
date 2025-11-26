#!/usr/bin/env bash
# Place in .platform/hooks/postdeploy directory
sudo certbot -n -d wards-dairies.is404.net --nginx --agree-tos --email karlie3@byu.edu
