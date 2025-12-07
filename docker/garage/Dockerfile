# Garage S3-compatible storage with Alpine base
# This wrapper ensures a shell is available for docker-compose compatibility
FROM alpine:3.19 as downloader

ARG GARAGE_VERSION=v0.9.3
ARG TARGETARCH

RUN apk add --no-cache curl tar

# Download Garage binary
RUN case "${TARGETARCH}" in \
    amd64) ARCH="x86_64" ;; \
    arm64) ARCH="aarch64" ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    curl -fsSL "https://garagehq.deuxfleurs.fr/_releases/${GARAGE_VERSION}/${ARCH}-unknown-linux-musl/garage" -o /garage && \
    chmod +x /garage

FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Copy Garage binary
COPY --from=downloader /garage /usr/local/bin/garage

# Create data directories
RUN mkdir -p /var/lib/garage/data /var/lib/garage/meta /etc/garage

# Create non-root user
RUN addgroup -S garage && adduser -S garage -G garage

# Set permissions
RUN chown -R garage:garage /var/lib/garage

VOLUME ["/var/lib/garage/data", "/var/lib/garage/meta"]

EXPOSE 3900 3901 3902

# Default config location
ENV GARAGE_CONFIG_FILE=/etc/garage.toml

# Run as non-root
USER garage

ENTRYPOINT ["/usr/local/bin/garage"]
CMD ["server"]
