#!/bin/bash

# Build Docker image
IMAGE_NAME="opdshelf"
IMAGE_TAG="latest"
PLATFORM="linux/amd64"

echo "Building Docker image: ${IMAGE_NAME}:${IMAGE_TAG} for platform: ${PLATFORM}"
docker build --platform ${PLATFORM} -t ${IMAGE_NAME}:${IMAGE_TAG} .

if [ $? -ne 0 ]; then
    echo "Docker build failed"
    exit 1
fi

echo "Docker build successful"

# Save image to tar file
TEMP_TAR="/tmp/${IMAGE_NAME}-${IMAGE_TAG}.tar"
OUTPUT_FILE="./opdshelf.tar.gz"
echo "Saving Docker image to ${OUTPUT_FILE}"
docker save -o ${TEMP_TAR} ${IMAGE_NAME}:${IMAGE_TAG}

if [ $? -ne 0 ]; then
    echo "Docker save failed"
    exit 1
fi

# Compress the tar file
echo "Compressing image..."
gzip -c ${TEMP_TAR} > ${OUTPUT_FILE}

if [ $? -ne 0 ]; then
    echo "Compression failed"
    rm -f ${TEMP_TAR}
    exit 1
fi

# Clean up temp file
rm -f ${TEMP_TAR}

echo "Docker image saved to ${OUTPUT_FILE}"
echo "Done!"
