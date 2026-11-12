FROM caddy:2-alpine
COPY . /srv/
# The team's login client reads this production flag from the served HTML.
RUN sed -i '/<head>/a <meta name="hsupick-account-api" content="enabled">' /srv/index.html \
    && sed -i 's|https://hsupick-campus-idea-contest.luckycrown8.chatgpt.site/|https://hsupick.cloud/|g' /srv/index.html
