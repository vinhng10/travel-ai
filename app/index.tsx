import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const CameraScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const cameraRef = useRef(null);
  const router = useRouter();

  // if (!permission) {
  //   return <View />;
  // }

  // if (!permission.granted) {
  //   // Camera permissions are not granted yet.
  //   return (
  //     <View style={styles.container}>
  //       <Text style={styles.message}>
  //         We need your permission to show the camera
  //       </Text>
  //       <Button onPress={requestPermission} title="Grant Permission" />
  //     </View>
  //   );
  // }

  const handleTakePhoto = async () => {
    try {
      if (cameraRef.current) {
        // Take a picture and get the file URI
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
        });
        // Calculate the aspect ratio
        const aspectRatio = photo.width / photo.height;

        // Calculate new dimensions
        let newWidth = 1000;
        let newHeight = 1000;

        if (aspectRatio > 1) {
          // Image is wider than it is tall
          newHeight = newWidth / aspectRatio;
        } else {
          // Image is taller than it is wide
          newWidth = newHeight * aspectRatio;
        }
        const resizedPhoto = await manipulateAsync(
          photo.uri,
          [{ resize: { width: newWidth, height: newHeight } }],
          { compress: 1, format: SaveFormat.JPEG }
        );

        try {
          // Create a new FormData object
          const formData = new FormData();

          // Append the blob to the FormData object
          formData.append("image", {
            uri: resizedPhoto.uri,
            type: "image/jpeg",
            name: "image.jpg",
          });

          // Make the POST request to your server
          const response = await fetch(
            "https://api.bing.microsoft.com/v7.0/images/visualsearch",
            {
              method: "POST",
              body: formData,
              headers: {
                "Ocp-Apim-Subscription-Key": "",
              },
            }
          );

          // Check if the request was successful
          if (response.ok) {
            const responseData = await response.json();
            // console.log(
            //   JSON.stringify(responseData["tags"][0]["actions"], null, 2)
            // );
            const results = [];
            for (let i in responseData["tags"][0]["actions"]) {
              const action = responseData["tags"][0]["actions"][i];
              if (
                action["_type"] == "ImageModuleAction" &&
                action["actionType"] == "VisualSearch"
              ) {
                for (let j in action["data"]["value"]) {
                  const value = action["data"]["value"][j];
                  results.push(value["name"]);
                }
              }
            }

            // results.slice(0, 5).forEach((r) => console.log(r));
          } else {
            console.error("Error uploading image:", response.statusText);
          }
        } catch (error) {
          console.log(error);
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  return (
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
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  camera: {
    flex: 1,
  },
  bottomSection: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: 20,
    alignItems: "center",
  },
  roundButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  text: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  message: {
    fontSize: 18,
    textAlign: "center",
    margin: 10,
    color: "#333333",
  },
});

export default CameraScreen;
