# Offline copy of the songs.winsys.lv server.
# Base matches production as closely as possible: PHP 7.2 + Apache
# (production: Ubuntu 18.04, PHP 7.2.24; this image: Debian buster, PHP 7.2.34).
FROM php:7.2-apache

# php:7.2 images are built on Debian buster, which is EOL — its packages now
# live on archive.debian.org. Repoint APT and stop validating the (expired)
# Release files, otherwise apt-get update fails.
RUN sed -i \
        -e 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' \
        -e 's|http://security.debian.org/debian-security|http://archive.debian.org/debian-security|g' \
        -e '/buster-updates/d' \
        /etc/apt/sources.list \
    && echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99archive

# WITH_PPTX=1 installs LibreOffice + Ghostscript, used by the sermon pptx/odp
# import (Ajax_Sermon). Set to 0 for a much smaller and faster build; the pptx
# import then returns its normal "LibreOffice missing" error and everything
# else keeps working.
ARG WITH_PPTX=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libzip-dev \
    && if [ "$WITH_PPTX" = "1" ]; then \
           apt-get install -y --no-install-recommends \
               libreoffice-impress ghostscript fonts-dejavu fonts-liberation; \
       fi \
    && rm -rf /var/lib/apt/lists/*

# mysqli — DB; pcntl + sockets — Workerman WebSocket server;
# zip — song list import (Ajax_Import). openssl/json/mbstring/curl are already
# compiled into the official image.
RUN docker-php-ext-configure zip --with-libzip \
    && docker-php-ext-install -j"$(nproc)" mysqli pcntl sockets zip

# rewrite — public/.htaccess routing; proxy_wstunnel — same-origin /ws
# WebSocket endpoint, exactly like the production reverse proxy.
RUN a2enmod rewrite proxy proxy_http proxy_wstunnel \
    && echo "ServerName localhost" >> /etc/apache2/apache2.conf

COPY apache-vhost.conf /etc/apache2/sites-available/000-default.conf
COPY php-app.ini /usr/local/etc/php/conf.d/app.ini
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Application code is bind-mounted at runtime (see docker-compose.yml);
# nothing is baked into the image.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
