FROM tryton/tryton:7.0

USER root
RUN pip3 install --break-system-packages --no-cache-dir \
      "trytond_party==7.0.*" \
      "trytond_country==7.0.*" \
      "trytond_company==7.0.*" \
    && rm -rf /root/.cache/pip

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
