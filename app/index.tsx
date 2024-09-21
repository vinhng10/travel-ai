import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Image } from "expo-image";
import EventSource from "react-native-sse";

const CameraScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const cameraRef = useRef(null);
  const router = useRouter();

  const parse = (data) => {
    const results: string[] = [];
    const pageIncludings = data["tags"][0]["actions"].find(
      (action) => action["actionType"] == "PagesIncluding"
    );
    pageIncludings["data"]["value"]
      .slice(0, 5)
      .forEach((value) => results.push(value["name"]));
    const visualSearch = data["tags"][0]["actions"].find(
      (action) => action["actionType"] == "VisualSearch"
    );
    visualSearch["data"]["value"]
      .slice(0, 5)
      .forEach((value) => results.push(value["name"]));
    return results;
  };

  const handleText = async () => {
    try {
      if (!cameraRef.current) return;

      // Take a picture and get the file URI
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
      });
      // Calculate the aspect ratio
      const aspectRatio = photo.width / photo.height;

      // Calculate new dimensions
      let newWidth = 1200;
      let newHeight = 1200;

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

      setImage(resizedPhoto.uri);

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
        "https://api.bing.microsoft.com/v7.0/images/visualsearch?mkt=en-US",
        {
          method: "POST",
          body: formData,
          headers: {
            "Ocp-Apim-Subscription-Key": "",
          },
        }
      );

      if (!response.ok) {
        throw Error(`Error uploading image: ${response.statusText}`);
      }

      const data = await response.json();
      const results = parse(data);
      console.log(results.map((r, i) => `${i + 1}. ${r}`).join("\n"));

      const es = new EventSource(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${""}`,
          },
          method: "POST",
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
              {
                role: "system",
                content: "You are a helpful assistant.",
              },
              {
                role: "user",
                content: "Hello.",
              },
            ],
            stream: true,
          }),
          pollingInterval: 0,
        }
      );

      es.addEventListener("open", () => {
        console.log("====> open");
      });

      es.addEventListener("message", (event) => {
        if (event.data === "[DONE]") {
          es.close();
          return;
        }

        const data = JSON.parse(event.data);
        if (data.choices[0].delta.content !== undefined) {
          console.log(data.choices[0].delta.content);
        }
      });

      es.addEventListener("close", () => {
        es.removeAllEventListeners();
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleSpeech = async () => {
    while (true) {
      console.log("Con Cac");
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          We need your permission to show the camera
        </Text>
        <TouchableOpacity onPress={requestPermission}>
          <Text style={styles.text}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return image ? (
    <View style={styles.container}>
      <Image style={styles.camera} source={image} />
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.roundButton}
          onPress={() => {
            setImage(null);
          }}
        >
          <Text style={styles.text}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={"back"} />
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.roundButton}
          onPress={async () => {
            handleText();
            handleSpeech();
          }}
        >
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
    flex: 10,
  },
  bottomSection: {
    flex: 2, // 20% of the screen for the button
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  roundButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
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
