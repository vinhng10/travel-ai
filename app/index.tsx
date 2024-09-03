import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Button } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system";

const CameraScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState(null);
  const cameraRef = useRef(null);
  const router = useRouter();

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="Grant Permission" />
      </View>
    );
  }

  const handleTakePhoto = async () => {
    try {
      if (cameraRef.current) {
        // Take a picture and get the file URI
        const photo = await cameraRef.current.takePictureAsync({
          // base64: true,
        });

        const response = await FileSystem.uploadAsync(
          `https://api.bing.microsoft.com/v7.0/images/visualsearch`,
          photo.uri,
          {
            fieldName: "image",
            mimeType: "image/jpeg",
            httpMethod: "POST",
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            headers: {
              "Ocp-Apim-Subscription-Key": "18afbf95480e4de897c64e2bd860d660",
            },
          }
        );
        console.log(JSON.stringify(response, null, 4));
      }
    } catch (error) {
      console.log(error);
    }
  };

  return image ? (
    <View style={styles.imageContainer}>
      <Image
        style={styles.image}
        source={image}
        contentFit="cover"
        transition={1000}
      />
      <TouchableOpacity
        style={styles.roundButton}
        onPress={() => {
          setImage(null);
        }}
      >
        <Text style={styles.text}>Return</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.container}>
      {/* Upper section with the camera stream */}
      <CameraView ref={cameraRef} style={styles.camera} facing={"back"} />

      {/* Bottom section with the button */}
      <View style={styles.bottomSection}>
        <TouchableOpacity style={styles.roundButton} onPress={handleTakePhoto}>
          <Text style={styles.text}>Take Photo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000", // Ensures the whole screen background is black
  },
  camera: {
    flex: 3, // Takes most of the screen
  },
  bottomSection: {
    flex: 1, // Takes up less space at the bottom
    backgroundColor: "#333", // Dark background for the bottom section
    justifyContent: "center", // Center the button vertically
    alignItems: "center", // Center the button horizontally
  },
  roundButton: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#00f",
    borderRadius: 50,
  },
  text: {
    color: "#fff",
    fontSize: 16,
  },
  message: {
    fontSize: 18,
    textAlign: "center",
    color: "#fff", // Ensures text is visible on the black background
  },
  imageContainer: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    flex: 1,
    width: "100%",
    backgroundColor: "#0553",
  },
});

export default CameraScreen;
