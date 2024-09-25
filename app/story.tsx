// import React, { useState, useEffect } from "react";
// import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
// import { Audio } from "expo-av";
// import { useRouter } from "expo-router";

// const StoryScreen = () => {
//   const [sound, setSound] = useState();
//   const [isPlaying, setIsPlaying] = useState(true);
//   const router = useRouter();

//   useEffect(() => {
//     playSound();

//     return () => {
//       if (sound) {
//         sound.unloadAsync();
//       }
//     };
//   }, []);

//   const playSound = async () => {
//     const { sound } = await Audio.Sound.createAsync(
//       require("../assets/7195980701383183621.mp3")
//     );
//     setSound(sound);
//     await sound.playAsync();
//   };

//   const handlePlayPause = async () => {
//     if (sound) {
//       if (isPlaying) {
//         await sound.pauseAsync();
//       } else {
//         await sound.playAsync();
//       }
//       setIsPlaying(!isPlaying);
//     }
//   };

//   const handleGoBack = () => {
//     if (sound) {
//       sound.stopAsync();
//     }
//     router.back();
//   };

//   return (
//     <View style={styles.container}>
//       <Text style={styles.text}>Some text displayed here</Text>
//       <TouchableOpacity style={styles.roundButton} onPress={handlePlayPause}>
//         <Text style={styles.text}>
//           {isPlaying ? "Pause Audio" : "Play Audio"}
//         </Text>
//       </TouchableOpacity>
//       <TouchableOpacity
//         style={[styles.roundButton, { marginTop: 20 }]}
//         onPress={handleGoBack}
//       >
//         <Text style={styles.text}>Go Back</Text>
//       </TouchableOpacity>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "#fff",
//   },
//   roundButton: {
//     width: 100,
//     height: 100,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "#00f",
//     borderRadius: 50,
//   },
//   text: {
//     color: "#fff",
//     fontSize: 16,
//   },
// });

// export default StoryScreen;
