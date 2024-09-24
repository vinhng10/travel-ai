import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Audio } from "expo-av";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { Image } from "expo-image";
import EventSource from "react-native-sse";

const CameraScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
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
        newHeight = newWidth / aspectRatio;
      } else {
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

      let text = "";
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
                content: "Tell me a very short story in 3 sentences.",
              },
            ],
            stream: true,
          }),
          pollingInterval: 0,
        }
      );

      es.addEventListener("open", () => {});

      es.addEventListener("message", async (event) => {
        if (event.data === "[DONE]") {
          es.close();
          return;
        }
        const data = JSON.parse(event.data);
        const content = data.choices[0].delta.content;
        if (content !== undefined) {
          text += content;
        }
      });

      es.addEventListener("close", async () => {
        const sentences = text.split(".");
        for (let i in sentences) {
          await enqueue(sentences[i]);
          await new Promise((r) => setTimeout(r, 1000));
        }
        es.removeAllEventListeners();
      });
    } catch (error) {
      console.error(error);
    }
  };

  const enqueue = async (text: string) => {
    try {
      // Make the POST request to the Eleven Labs TTS API
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/nPczCjzI2devNBz1zQrb`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "xi-api-key": "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.8,
              style: 0.0,
              use_speaker_boost: true,
            },
          }),
        }
      );

      // Check for HTTP errors
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // Get the audio response
      const blob = await response.blob();

      // Define the path to save the file
      const path = `${
        FileSystem.documentDirectory
      }${Date.now().toString()}.wav`;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result.split(",")[1];
        await FileSystem.writeAsStringAsync(path, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      };
      reader.readAsDataURL(blob);

      setQueue([...queue, path]);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAudio = async () => {
    if (queue.length > 0 && !isPlaying) {
      setIsPlaying(true);
      const audio = queue[0];

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: audio },
          { shouldPlay: true }
        );

        await sound.playAsync();

        // Wait for the audio to finish playing
        let intervalId = setInterval(async () => {
          const status = await sound.getStatusAsync();
          if (!status.isPlaying) {
            await sound.unloadAsync();
            setQueue((prevQueue) => prevQueue.slice(1));
            setIsPlaying(false);
            clearInterval(intervalId);
          }
        }, 300);
      } catch (error) {
        console.error("Error playing audio:", error);
        setIsPlaying(false);
      }
    }
  };

  useEffect(() => {
    handleAudio();
  }, [queue, isPlaying]);

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
        <TouchableOpacity style={styles.roundButton} onPress={handleText}>
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
