import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Audio } from "expo-av";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { Image } from "expo-image";
import EventSource from "react-native-sse";
import cheerio from "react-native-cheerio";

const CameraScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const [textQueue, setTextQueue] = useState<string[]>([]);
  const [isTTS, setIsTTS] = useState(false);
  const [audioQueue, setAudioQueue] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [stop, setStop] = useState(true);
  const cameraRef = useRef(null);
  const router = useRouter();
  const toolSchemas = [
    {
      type: "function",
      function: {
        name: "search",
        description: "Perform a Google search given a query string.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to be used.",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "scrape",
        description:
          "Extract and return the text content from the webpage at the given URL.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL of the webpage to scrape for text content.",
            },
          },
          required: ["url"],
        },
      },
    },
  ];

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

  const search = async (query: string) => {
    try {
      const results = [];
      const params = new URLSearchParams({
        key: "AIzaSyAv6tH86BlLoqfffajxG2nyJGLcrEZ2xMM",
        cx: "96b297446bad847ad",
        q: query,
        start: "1",
      });

      // Make the HTTP GET request to the Google Custom Search JSON API
      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?${params}`
      );

      const data = await response.json();

      const searchResults = data.items || [];

      // Extract search results and parse them
      searchResults.slice(0, 3).forEach((searchItem) => {
        results.push({
          title: searchItem.title,
          description: searchItem.snippet,
          url: searchItem.link,
        });
      });

      return results;
    } catch (e) {
      console.error(`Error making Google search: ${e}`);
      return [];
    }
  };

  const scrape = async (url: string): Promise<string> => {
    try {
      // Send an HTTP GET request to the URL
      const response = await fetch(url);

      // Check if the request was successful (status code 200)
      if (response.status !== 200) {
        throw Error("Fetch URL failed");
      }

      // Parse the HTML content of the page using cheerio
      const data = await response.text();
      const $ = cheerio.load(data);

      // Extract the text content of the webpage and limit it to 2000 characters
      const text = $("p")
        .map((i, p) => $(p).text().trim())
        .get()
        .join("\n")
        .slice(0, 2000);

      return text;
    } catch (e) {
      console.error(`An error occurred: ${e}`);
      return "";
    }
  };

  const handleImage = async () => {
    try {
      if (!cameraRef.current) return;

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
      console.log(response);
      if (!response.ok) {
        throw Error(response.statusText);
      }
      const data = await response.json();
      const results = parse(data);

      let messages = [
        {
          role: "system",
          content:
            "You are an esteemed art history professor with expertise in " +
            "identifying artworks and interpreting their content. When " +
            "presented with a list of visual search results, identify the " +
            "actual artwork, including its title and artist. Then, describe " +
            "the specific event or moment depicted in the piece. Use the " +
            "tools if necessary to gather additional information to ensure " +
            "your response is accurate and complete.",
        },
        {
          role: "user",
          content:
            `Here is a list of visual search results of an artwork:\n\n${results
              .map((r, i) => `${i + 1}. ${r}`)
              .join("\n")}\n\n` +
            `Identify the true artwork, then describe the specific event ` +
            `or moment depicted in that artwork.`,
        },
      ];

      setMessages(messages);
      setStop(false);
    } catch (error) {
      console.error("Image handling failed:", error);
    }
  };

  const handleText = async () => {
    try {
      if (stop) return;

      const tools = { search: search, scrape: scrape };

      const es = new EventSource("https://api.openai.com/v1/chat/completions", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${""}`,
        },
        method: "POST",
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: messages,
          tools: toolSchemas,
          stream: true,
        }),
        pollingInterval: 0,
      });

      let text = "";
      let toolCalls = {};

      es.addEventListener("open", () => {});

      es.addEventListener("message", async (event) => {
        if (event.data === "[DONE]") {
          es.close();
          return;
        }
        const choice = JSON.parse(event.data).choices[0];

        switch (choice.finish_reason) {
          case "stop":
            console.log(messages);
            setMessages([]);
            setStop(true);
            break;

          case "tool_calls":
            const _messages = [
              {
                role: "assistant",
                tool_calls: Object.values(toolCalls),
              },
            ];

            for (const toolCall of Object.values(toolCalls)) {
              const tool = toolCall.function;
              const args = JSON.parse(tool.arguments);
              const result = await tools[tool.name](...Object.values(args));

              _messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ result: result }),
              });
            }

            setMessages((m) => [...m, ..._messages]);
            break;

          default:
            const delta = choice.delta;
            if (delta.tool_calls != null) {
              for (const toolCall of delta.tool_calls) {
                if (!toolCalls[toolCall.index]) {
                  toolCalls[toolCall.index] = {
                    id: toolCall.id,
                    type: "function",
                    function: {
                      name: toolCall.function.name,
                      arguments: toolCall.function.arguments,
                    },
                  };
                } else {
                  toolCalls[toolCall.index].function.arguments +=
                    toolCall.function.arguments;
                }
              }
            } else {
              switch (delta.content) {
                case ".":
                  setTextQueue((q) => [...q, text]);
                  text = "";
                  break;
                case undefined:
                  break;
                default:
                  text += delta.content;
              }
            }
            break;
        }
      });

      es.addEventListener("close", async () => {
        es.removeAllEventListeners();
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleTTS = async () => {
    // Text queue is empty, or current text is still TTS
    if (textQueue.length <= 0 || isTTS) return;

    try {
      setIsTTS(true);
      const text = textQueue[0];

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

      let timeoutId = setTimeout(() => {
        setAudioQueue((q) => [...q, path]);
        setTextQueue((q) => q.slice(1));
        setIsTTS(false);
        clearTimeout(timeoutId);
      }, 500);
    } catch (error) {
      console.error("TTS failed:", error);
      setIsTTS(false);
    }
  };

  const handlePlaying = async () => {
    // Audio queue is empty, or current audio is still playing
    if (audioQueue.length <= 0 || isPlaying) return;

    try {
      setIsPlaying(true);
      const audio = audioQueue[0];

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
          setAudioQueue((q) => q.slice(1));
          setIsPlaying(false);
          clearInterval(intervalId);
        }
      }, 200);
    } catch (error) {
      console.error("Playing audio failed:", error);
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    handleText();
  }, [messages, stop]);

  useEffect(() => {
    handleTTS();
  }, [textQueue, isTTS]);

  useEffect(() => {
    handlePlaying();
  }, [audioQueue, isPlaying]);

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
        <TouchableOpacity style={styles.roundButton} onPress={handleImage}>
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
