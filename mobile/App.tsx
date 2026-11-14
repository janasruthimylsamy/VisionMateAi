
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform
} from 'react-native';

import * as Speech from 'expo-speech';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';

import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent
} from 'expo-speech-recognition';

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://visionmateai-server.vercel.app'
).replace(/\/+$/, '');

const languages = [
  { code: 'en-IN', name: 'English' },
  { code: 'ta-IN', name: 'தமிழ்' },
  { code: 'hi-IN', name: 'हिन्दी' },
  { code: 'te-IN', name: 'తెలుగు' },
  { code: 'ml-IN', name: 'മലയാളം' },
  { code: 'kn-IN', name: 'ಕನ್ನಡ' },
  { code: 'bn-IN', name: 'বাংলা' },
  { code: 'mr-IN', name: 'मराठी' },
  { code: 'gu-IN', name: 'ગુજરાતી' },
  { code: 'pa-IN', name: 'ਪੰਜਾਬੀ' },
  { code: 'ur-IN', name: 'اردو' },
  { code: 'or-IN', name: 'ଓଡ଼ିଆ' },
  { code: 'as-IN', name: 'অসমীয়া' }
];

type Tab =
  | 'home'
  | 'talk'
  | 'scan'
  | 'navigate'
  | 'read'
  | 'safety'
  | 'settings';

type Message = {
  role: 'user' | 'assistant';
  text: string;
};

const COLORS = {
  background: '#F7F4F8',
  surface: '#FFFFFF',
  plum: '#291633',
  deepPlum: '#1D1025',
  violet: '#8050B5',
  brightViolet: '#9B65D0',
  lilac: '#EDE2F5',
  softLilac: '#F5EFF8',
  rose: '#F5E8EF',
  champagne: '#D9BD83',
  text: '#302638',
  muted: '#766C7D',
  border: '#E9E0ED',
  danger: '#A83D52',
  success: '#397B62'
};

// --------------------------------------------------
// MAIN APPLICATION
// --------------------------------------------------

export default function App() {
  const [tab, setTab] = useState<Tab>('home');

  const [language, setLanguage] = useState('en-IN');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);

  const [cameraPermission, requestCameraPermission] =
    useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);

  const [cameraReady, setCameraReady] = useState(false);

  const [scanBusy, setScanBusy] = useState(false);
  const [lastResult, setLastResult] = useState('');

  const [readText, setReadText] = useState('');
  const [readBusy, setReadBusy] = useState(false);

  const [destination, setDestination] = useState('');

  const [contact, setContact] = useState('');
  const [contactSaved, setContactSaved] = useState('');

  const [sosNotice, setSosNotice] = useState('');

  const selectedLanguage =
    languages.find(item => item.code === language) || languages[0];

  // --------------------------------------------------
  // SPEECH OUTPUT
  // --------------------------------------------------

  const speak = (text: string) => {
    if (!text.trim()) return;

    Speech.stop();

    Speech.speak(text, {
      language,
      rate: 0.88,
      pitch: 1
    });
  };

  // --------------------------------------------------
  // SPEECH RECOGNITION EVENTS
  // --------------------------------------------------

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
  });

  useSpeechRecognitionEvent('error', (event: any) => {
    setListening(false);

    speak(
      `Voice input error. ${
        event?.message || 'Please try again or type your request.'
      }`
    );
  });

  useSpeechRecognitionEvent('result', (event: any) => {
    const transcript = event?.results?.[0]?.transcript;

    if (!transcript) return;

    setInput(transcript);

    if (tab === 'navigate') {
      setDestination(transcript);

      speak(
        `Destination entered: ${transcript}. Tap open walking directions when you are ready.`
      );
    } else if (tab === 'talk') {
      askAI(transcript);
    } else {
      handleVoiceCommand(transcript);
    }
  });

  // --------------------------------------------------
  // INITIAL SETUP
  // --------------------------------------------------

  useEffect(() => {
    if (Platform.OS !== 'web') {
      SecureStore.getItemAsync('trusted_contact')
        .then(value => {
          if (value) setContactSaved(value);
        })
        .catch(() => {});
    }

    speak(
      'Welcome to VisionMate AI. Select Talk to AI, Scan an object, or Navigate.'
    );

    return () => {
      Speech.stop();

      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
    };
  }, []);

  // Reset camera readiness when changing screens.
  useEffect(() => {
    setCameraReady(false);
  }, [tab]);

  // --------------------------------------------------
  // VOICE INPUT
  // --------------------------------------------------

  const startListening = async () => {
    try {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();

      if (!permission.granted) {
        speak(
          'Microphone permission is required for voice input. You can still type.'
        );
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: language,
        interimResults: false,
        continuous: false
      });
    } catch {
      speak(
        'Voice recognition is not available on this device. Please type your request.'
      );
    }
  };

  // --------------------------------------------------
  // BACKEND CONNECTION
  // --------------------------------------------------

  const callApi = async (path: string, body: any) => {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 100000);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const responseText = await response.text();

      let data: any;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          `Server returned an invalid response (${response.status}).`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error || `Server error: ${response.status}`
        );
      }

      return data;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(
          'The AI request timed out. Please try again.'
        );
      }

      if (
        error instanceof TypeError ||
        error?.message === 'Network request failed'
      ) {
        throw new Error(
          'Cannot connect to VisionMate server. Check your internet connection and backend deployment.'
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  // --------------------------------------------------
  // AI CHAT
  // --------------------------------------------------

  const askAI = async (text: string) => {
    const question = text.trim();

    if (!question || busy) return;

    const next = [
      ...messages,
      {
        role: 'user' as const,
        text: question
      }
    ];

    setMessages(next);
    setInput('');
    setBusy(true);

    try {
      const data = await callApi('/api/chat', {
        message: question,
        language
      });

      const answer = String(
        data.answer ||
        'I could not prepare an answer. Please try again.'
      );

      setMessages([
        ...next,
        {
          role: 'assistant',
          text: answer
        }
      ]);

      speak(answer);
    } catch (error: any) {
      const message =
        `I could not reach the AI service. ${
          error?.message || 'Please try again.'
        }`;

      setMessages([
        ...next,
        {
          role: 'assistant',
          text: message
        }
      ]);

      speak(message);
    } finally {
      setBusy(false);
    }
  };

  // --------------------------------------------------
  // VOICE COMMANDS
  // --------------------------------------------------

  const handleVoiceCommand = (text: string) => {
    const lower = text.toLowerCase();

    if (
      lower.includes('scan') ||
      lower.includes('what is this') ||
      lower.includes('identify')
    ) {
      navigateTo('scan', 'Object scanner');
    } else if (
      lower.includes('navigate') ||
      lower.includes('take me') ||
      lower.includes('direction')
    ) {
      navigateTo('navigate', 'Navigation');
    } else if (lower.includes('read')) {
      navigateTo('read', 'Read text');
    } else if (
      lower.includes('emergency') ||
      lower.includes('help me')
    ) {
      navigateTo('safety', 'Emergency assistance');
    } else {
      setTab('talk');
      askAI(text);
    }
  };

  // --------------------------------------------------
  // CAMERA PERMISSION
  // --------------------------------------------------

  const ensureCameraPermission = async () => {
    if (cameraPermission?.granted) {
      return true;
    }

    const permission = await requestCameraPermission();

    if (!permission.granted) {
      speak('Camera permission was not granted.');
      return false;
    }

    return true;
  };

  // --------------------------------------------------
  // CAMERA OBJECT RECOGNITION
  // --------------------------------------------------

  const scanObject = async () => {
    if (scanBusy) return;

    const permitted = await ensureCameraPermission();

    if (!permitted) return;

    if (!cameraReady || !cameraRef.current) {
      speak('Camera is still starting. Please wait a moment.');
      return;
    }

    try {
      setScanBusy(true);
      setLastResult('');

      speak('Capturing the image. Please wait.');

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.65,
        base64: true
      });

      if (!photo?.base64) {
        throw new Error(
          'Could not capture the image. Please try again.'
        );
      }

      speak('Image captured. Analysing it now.');

      const data = await callApi('/api/describe-image', {
        imageBase64: photo.base64,
        mimeType: 'image/jpeg',
        language
      });

      const description = String(
        data.description ||
        'I could not identify the object clearly.'
      );

      setLastResult(description);

      speak(description);
    } catch (error: any) {
      const message =
        `I could not analyse this image. ${
          error?.message || 'Please try again.'
        }`;

      setLastResult(message);

      speak(message);
    } finally {
      setScanBusy(false);
    }
  };

  // --------------------------------------------------
  // CAMERA TEXT RECOGNITION / OCR
  // --------------------------------------------------

  const scanText = async () => {
    if (readBusy) return;

    const permitted = await ensureCameraPermission();

    if (!permitted) return;

    if (!cameraReady || !cameraRef.current) {
      speak('Camera is still starting. Please wait a moment.');
      return;
    }

    try {
      setReadBusy(true);
      setReadText('');

      speak('Capturing the page. Please hold your phone steady.');

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.65,
        base64: true
      });

      if (!photo?.base64) {
        throw new Error(
          'Could not capture the image. Please try again.'
        );
      }

      speak('Image captured. Extracting the text.');

      const data = await callApi('/api/read-text', {
        imageBase64: photo.base64,
        mimeType: 'image/jpeg',
        language
      });

      const extractedText = String(data.text || '').trim();

      if (!extractedText) {
        const message =
          data.message ||
          'No readable text was found. Try better lighting and focus.';

        setReadText('');
        speak(message);
        return;
      }

      setReadText(extractedText);

      speak(
        'Text extraction is complete. Press Read text aloud to listen.'
      );
    } catch (error: any) {
      const message =
        `I could not extract the text. ${
          error?.message || 'Please try again.'
        }`;

      speak(message);

      Alert.alert('Text extraction failed', message);
    } finally {
      setReadBusy(false);
    }
  };

  // --------------------------------------------------
  // WALKING DIRECTIONS
  // --------------------------------------------------

  const openWalkingDirections = async () => {
    if (!destination.trim()) {
      speak('Please enter or say a destination first.');
      return;
    }

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        speak(
          'Location permission is needed to start directions.'
        );
        return;
      }

      const location =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });

      const url =
        `https://www.google.com/maps/dir/?api=1` +
        `&origin=${location.coords.latitude},${location.coords.longitude}` +
        `&destination=${encodeURIComponent(destination)}` +
        `&travelmode=walking`;

      speak(
        `Opening walking directions to ${destination} in Google Maps. Follow spoken directions and use your usual mobility aid.`
      );

      await Linking.openURL(url);
    } catch {
      speak(
        'I could not get your location or open maps. Check your location and internet settings.'
      );
    }
  };

  // --------------------------------------------------
  // EMERGENCY DIALER
  // --------------------------------------------------

  const openEmergencyDialer = async (number: string) => {
    if (Platform.OS === 'web') {
      const message =
        `Browser preview cannot reliably place phone calls. Please use a real phone and dial ${number} directly.`;

      setSosNotice(message);
      speak(message);
      return;
    }

    try {
      const url = `tel:${number}`;
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        const message =
          'Phone calling is not available on this device. Please dial the number manually.';

        setSosNotice(message);
        speak(message);

        Alert.alert('Calling unavailable', message);
        return;
      }

      speak(
        `Opening the phone dialer for ${number}. Please confirm the call on your phone.`
      );

      await Linking.openURL(url);
    } catch {
      const message =
        'I could not open the phone dialer. Please dial the number manually.';

      setSosNotice(message);
      speak(message);

      Alert.alert('Unable to open dialer', message);
    }
  };

  const callTrustedContact = () => {
    if (!contactSaved) {
      const message =
        'No trusted contact is saved. Add a phone number in Settings first.';

      setSosNotice(message);
      speak(message);

      if (Platform.OS !== 'web') {
        Alert.alert('No trusted contact', message);
      }

      return;
    }

    if (Platform.OS === 'web') {
      const message =
        `Your trusted contact is ${contactSaved}. Use your phone dialer to call this number.`;

      setSosNotice(message);
      speak(message);
      return;
    }

    Alert.alert(
      'Call trusted contact?',
      `Open your phone dialer for ${contactSaved}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => speak('Call cancelled.')
        },
        {
          text: 'Continue',
          onPress: () => openEmergencyDialer(contactSaved)
        }
      ]
    );
  };

  const callEmergency112 = () => {
    if (Platform.OS === 'web') {
      const message =
        'If you are in immediate danger in India, use a real phone and dial 112. Browser preview cannot place emergency calls.';

      setSosNotice(message);
      speak(message);
      return;
    }

    Alert.alert(
      'Call emergency services?',
      'This will open your phone dialer for 112. You must confirm the call on your phone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => speak('Emergency call cancelled.')
        },
        {
          text: 'Continue',
          onPress: () => openEmergencyDialer('112')
        }
      ]
    );
  };

  // --------------------------------------------------
  // REUSABLE UI COMPONENTS
  // --------------------------------------------------

  const Header = ({
    title,
    desc
  }: {
    title: string;
    desc?: string;
  }) => (
    <View style={styles.pageHeader}>
      <Text accessibilityRole="header" style={styles.pageTitle}>
        {title}
      </Text>

      {!!desc && (
        <Text style={styles.pageDescription}>{desc}</Text>
      )}
    </View>
  );

  const Button = ({
    title,
    onPress,
    secondary = false,
    danger = false,
    disabled = false
  }: any) => (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        danger && styles.dangerButton,
        disabled && styles.disabled
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.secondaryButtonText
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );

  const FeatureCard = ({
    icon,
    title,
    subtitle,
    onPress,
    accent = false
  }: any) => (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={[
        styles.featureCard,
        accent && styles.featureCardAccent
      ]}
    >
      <View
        style={[
          styles.featureIcon,
          accent && styles.featureIconAccent
        ]}
      >
        <Text style={styles.featureEmoji}>{icon}</Text>
      </View>

      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>

      <Text style={styles.featureArrow}>↗</Text>
    </TouchableOpacity>
  );

  const navigateTo = (nextTab: Tab, label: string) => {
    setCameraReady(false);
    setTab(nextTab);
    speak(`${label} screen`);
  };

  // --------------------------------------------------
  // MAIN SCREEN
  // --------------------------------------------------

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.deepPlum}
      />

      {/* TOP BRAND HEADER */}

      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <View style={styles.brandLogo}>
            <Text style={styles.brandLogoText}>✿</Text>
          </View>

          <View>
            <Text style={styles.brand}>
              VisionMate <Text style={styles.brandAccent}>AI</Text>
            </Text>

            <Text style={styles.tagline}>
              YOUR WORLD, WITHIN REACH
            </Text>
          </View>
        </View>

        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Read current screen aloud"
          onPress={() => speak(`VisionMate AI. ${tab} screen.`)}
          style={styles.speaker}
        >
          <Text style={styles.speakerText}>◖))</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* HOME */}

        {tab === 'home' && (
          <>
            <View style={styles.welcomeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.welcomeSmall}>
                  WELCOME TO VISIONMATE
                </Text>

                <Text style={styles.welcomeTitle}>
                  A little help.
                  {'\n'}
                  More independence.
                </Text>

                <Text style={styles.welcomeDescription}>
                  Your intelligent accessibility companion is ready
                  to assist you.
                </Text>
              </View>

              <View style={styles.welcomeSymbol}>
                <Text style={styles.welcomeSymbolText}>✧</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.voiceHero}
              onPress={() => navigateTo('talk', 'Talk to AI')}
              accessibilityRole="button"
              accessibilityLabel="Talk to AI. Start a voice conversation."
            >
              <View style={styles.voiceHeroTop}>
                <View style={styles.voiceCircle}>
                  <Text style={styles.voiceIcon}>♫</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.voiceHeroTitle}>
                    Your AI companion
                  </Text>

                  <Text style={styles.voiceHeroSub}>
                    Ask. Listen. Explore.
                  </Text>
                </View>

                <Text style={styles.voiceArrow}>↗</Text>
              </View>

              <View style={styles.voiceHeroFooter}>
                <Text style={styles.voiceHeroFooterText}>
                  TAP TO START A CONVERSATION
                </Text>

                <Text style={styles.voiceHeroFooterIcon}>●</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.sectionHeadingRow}>
              <View>
                <Text style={styles.sectionTitle}>
                  Explore your tools
                </Text>

                <Text style={styles.sectionSub}>
                  Everything you need, in one place.
                </Text>
              </View>

              <Text style={styles.sectionCount}>04 TOOLS</Text>
            </View>

            <View style={styles.featureGrid}>
              <FeatureCard
                icon="◉"
                title="Object scanner"
                subtitle="Understand your surroundings"
                onPress={() => navigateTo('scan', 'Object scanner')}
              />

              <FeatureCard
                icon="⌖"
                title="Navigation"
                subtitle="Find your way with directions"
                onPress={() => navigateTo('navigate', 'Navigation')}
                accent
              />

              <FeatureCard
                icon="▤"
                title="Read text"
                subtitle="Listen to written information"
                onPress={() => navigateTo('read', 'Read text')}
              />

              <FeatureCard
                icon="♫"
                title="Voice assistant"
                subtitle="Talk naturally with AI"
                onPress={() => navigateTo('talk', 'Voice assistant')}
              />
            </View>

            <TouchableOpacity
              style={styles.safetyBanner}
              onPress={() =>
                navigateTo('safety', 'Emergency assistance')
              }
              accessibilityRole="button"
              accessibilityLabel="Emergency assistance. Open safety options."
            >
              <View style={styles.safetyBannerIcon}>
                <Text style={styles.safetyBannerIconText}>!</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.safetyBannerTitle}>
                  Safety assistance
                </Text>

                <Text style={styles.safetyBannerSub}>
                  Your trusted contact and emergency options
                </Text>
              </View>

              <Text style={styles.safetyBannerArrow}>›</Text>
            </TouchableOpacity>

            <View style={styles.homeFooter}>
              <Text style={styles.homeFooterText}>
                Designed with accessibility in mind.
              </Text>
            </View>
          </>
        )}

        {/* TALK TO AI */}

        {tab === 'talk' && (
          <>
            <Header
              title="Your AI companion"
              desc="Speak naturally. I'll respond out loud."
            />

            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  listening && styles.statusDotActive
                ]}
              />

              <Text style={styles.statusText}>
                {listening ? 'Listening to you' : 'Ready to assist'}
              </Text>
            </View>

            <View
              style={styles.chatBox}
              accessibilityLiveRegion="polite"
            >
              {messages.length === 0 && (
                <View style={styles.emptyChat}>
                  <View style={styles.emptyChatIcon}>
                    <Text style={styles.emptyChatSymbol}>✧</Text>
                  </View>

                  <Text style={styles.emptyTitle}>
                    How can I help you today?
                  </Text>

                  <Text style={styles.empty}>
                    Your conversation will appear here. Try asking
                    about something around you.
                  </Text>
                </View>
              )}

              {messages.map((message, index) => (
                <View
                  key={index}
                  style={[
                    styles.bubble,
                    message.role === 'user'
                      ? styles.userBubble
                      : styles.aiBubble
                  ]}
                >
                  <Text style={styles.role}>
                    {message.role === 'user'
                      ? 'YOU'
                      : 'VISIONMATE AI'}
                  </Text>

                  <Text style={styles.message}>
                    {message.text}
                  </Text>

                  {message.role === 'assistant' && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Repeat response"
                      onPress={() => speak(message.text)}
                    >
                      <Text style={styles.repeat}>
                        ◖)) Listen again
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {busy && (
                <ActivityIndicator
                  size="large"
                  color={COLORS.violet}
                />
              )}
            </View>

            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Type your question here..."
              placeholderTextColor={COLORS.muted}
              multiline
              style={styles.input}
              accessibilityLabel="Your question"
            />

            <Button
              title={
                listening
                  ? 'Stop listening'
                  : '♫ Speak to VisionMate'
              }
              onPress={() =>
                listening
                  ? ExpoSpeechRecognitionModule.stop()
                  : startListening()
              }
            />

            <Button
              title="Send message"
              onPress={() => askAI(input)}
              disabled={busy || !input.trim()}
              secondary
            />
          </>
        )}

        {/* OBJECT SCANNER */}

        {tab === 'scan' && (
          <>
            <Header
              title="Object scanner"
              desc="Point your camera towards an object and let VisionMate describe what it sees."
            />

            <View style={styles.scanInfo}>
              <Text style={styles.scanInfoTitle}>
                AI-powered visual assistance
              </Text>

              <Text style={styles.scanInfoText}>
                Position one object clearly in the camera view before
                capturing.
              </Text>
            </View>

            <View style={styles.cameraWrap}>
              {cameraPermission?.granted ? (
                <CameraView
                  key="object-camera"
                  ref={cameraRef}
                  style={styles.camera}
                  facing={Platform.OS === 'web' ? 'front' : 'back'}
                  onCameraReady={() => setCameraReady(true)}
                />
              ) : (
                <View style={styles.cameraPlaceholder}>
                  <Text style={styles.cameraPlaceholderIcon}>◉</Text>

                  <Text style={styles.cameraPlaceholderTitle}>
                    Camera permission needed
                  </Text>

                  <Text style={styles.cameraPlaceholderText}>
                    Allow camera access to identify objects.
                  </Text>

                  <Button
                    title="Allow camera"
                    onPress={requestCameraPermission}
                  />
                </View>
              )}
            </View>

            {!cameraReady && cameraPermission?.granted && (
              <Text style={styles.cameraStatus}>
                Starting camera. Please wait...
              </Text>
            )}

            <Button
              title={
                scanBusy
                  ? 'Analysing image...'
                  : 'Capture and describe'
              }
              onPress={scanObject}
              disabled={scanBusy || !cameraReady}
            />

            {scanBusy && (
              <ActivityIndicator
                size="large"
                color={COLORS.violet}
                style={{ marginTop: 18 }}
              />
            )}

            {!!lastResult && (
              <View style={styles.result}>
                <Text style={styles.resultLabel}>
                  VISIONMATE DESCRIPTION
                </Text>

                <Text style={styles.cardTitle}>
                  What I can see
                </Text>

                <Text style={styles.message}>
                  {lastResult}
                </Text>

                <Button
                  title="◖)) Read description aloud"
                  secondary
                  onPress={() => speak(lastResult)}
                />
              </View>
            )}

            <Text style={styles.safetyNote}>
              AI descriptions can be incorrect. Do not rely on them
              alone for medicine identification, food safety, hazard
              detection or other critical decisions.
            </Text>
          </>
        )}

        {/* NAVIGATION */}

        {tab === 'navigate' && (
          <>
            <Header
              title="Smart navigation"
              desc="Choose a destination and open walking directions."
            />

            <View style={styles.navigationPanel}>
              <Text style={styles.navigationIcon}>⌖</Text>

              <Text style={styles.navigationTitle}>
                Where would you like to go?
              </Text>

              <Text style={styles.navigationDescription}>
                Enter a destination or use voice input.
              </Text>
            </View>

            <Text style={styles.fieldLabel}>
              YOUR DESTINATION
            </Text>

            <TextInput
              value={destination}
              onChangeText={setDestination}
              placeholder="For example, nearest pharmacy"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
              accessibilityLabel="Destination"
            />

            <Button
              title="♫ Say destination"
              onPress={() => {
                speak('Please say your destination.');
                startListening();
              }}
              secondary
            />

            <Button
              title="Open walking directions"
              onPress={openWalkingDirections}
            />

            <View style={styles.result}>
              <Text style={styles.resultLabel}>
                IMPORTANT SAFETY INFORMATION
              </Text>

              <Text style={styles.message}>
                This feature hands directions to Google Maps. GPS
                does not detect every obstacle, drop-off, vehicle or
                safe crossing. Never cross a road based only on this
                app. Use your established mobility aid and follow
                local traffic signals.
              </Text>
            </View>
          </>
        )}

        {/* READ TEXT / OCR */}

        {tab === 'read' && (
          <>
            <Header
              title="Read text aloud"
              desc="Capture printed text and let VisionMate extract and speak it."
            />

            <View style={styles.readPanel}>
              <Text style={styles.readIcon}>▤</Text>

              <Text style={styles.readTitle}>
                Your personal text reader
              </Text>

              <Text style={styles.readDescription}>
                Point your camera at a page, notice, document or
                printed label. VisionMate will extract the visible
                text so you can listen to it.
              </Text>
            </View>

            <Text style={styles.fieldLabel}>
              CAMERA SCANNER
            </Text>

            <View style={styles.cameraWrap}>
              {cameraPermission?.granted ? (
                <CameraView
                  key="text-camera"
                  ref={cameraRef}
                  style={styles.camera}
                  facing={Platform.OS === 'web' ? 'front' : 'back'}
                  onCameraReady={() => setCameraReady(true)}
                />
              ) : (
                <View style={styles.cameraPlaceholder}>
                  <Text style={styles.cameraPlaceholderIcon}>▤</Text>

                  <Text style={styles.cameraPlaceholderTitle}>
                    Camera permission needed
                  </Text>

                  <Text style={styles.cameraPlaceholderText}>
                    Allow camera access to scan printed text.
                  </Text>

                  <Button
                    title="Allow camera"
                    onPress={requestCameraPermission}
                  />
                </View>
              )}
            </View>

            {!cameraReady && cameraPermission?.granted && (
              <Text style={styles.cameraStatus}>
                Starting camera. Please wait...
              </Text>
            )}

            <Button
              title={
                readBusy
                  ? 'Extracting text...'
                  : 'Capture page and extract text'
              }
              onPress={scanText}
              disabled={readBusy || !cameraReady}
            />

            {readBusy && (
              <View style={styles.loadingArea}>
                <ActivityIndicator
                  size="large"
                  color={COLORS.violet}
                />

                <Text style={styles.loadingText}>
                  VisionMate is reading the image. Please wait.
                </Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>
              EXTRACTED TEXT
            </Text>

            <TextInput
              value={readText}
              onChangeText={setReadText}
              placeholder="Your extracted text will appear here. You can also type or paste text."
              placeholderTextColor={COLORS.muted}
              multiline
              style={[styles.input, styles.readTextInput]}
              accessibilityLabel="Extracted text. You can edit this text."
              textAlignVertical="top"
            />

            <Button
              title="◖)) Read text aloud"
              onPress={() =>
                readText.trim()
                  ? speak(readText.trim())
                  : speak('Please scan a page or enter some text first.')
              }
              disabled={!readText.trim() || readBusy}
            />

            <Button
              title="Stop reading"
              secondary
              onPress={() => Speech.stop()}
            />

            <Button
              title="Clear extracted text"
              secondary
              onPress={() => {
                Speech.stop();
                setReadText('');
                speak('Text cleared.');
              }}
              disabled={!readText.trim() || readBusy}
            />

            <Text style={styles.safetyNote}>
              OCR may misread small, blurry or poorly lit text.
              Always verify important information such as medicine
              instructions, expiry dates, financial details and
              emergency information with a trusted person or the
              original source.
            </Text>
          </>
        )}

        {/* SAFETY */}

        {tab === 'safety' && (
          <>
            <Header
              title="Safety assistance"
              desc="Keep important contact options accessible."
            />

            <View style={styles.emergencyPanel}>
              <View style={styles.emergencySymbol}>
                <Text style={styles.emergencySymbolText}>!</Text>
              </View>

              <Text style={styles.emergencyTitle}>
                Your safety matters
              </Text>

              <Text style={styles.emergencyDescription}>
                Contact a trusted person or open the emergency
                dialer when you need assistance.
              </Text>
            </View>

            <View style={styles.result}>
              <Text style={styles.resultLabel}>
                TRUSTED CONTACT
              </Text>

              <Text style={styles.cardTitle}>
                {contactSaved || 'No contact saved'}
              </Text>

              {!contactSaved && (
                <Text style={styles.cardSub}>
                  Add a phone number in Settings first.
                </Text>
              )}
            </View>

            <Button
              title="Call trusted contact"
              onPress={callTrustedContact}
            />

            <View style={styles.emergencyNumber}>
              <Text style={styles.emergencyNumberLabel}>
                INDIA EMERGENCY NUMBER
              </Text>

              <Text style={styles.emergencyNumberValue}>
                112
              </Text>

              <Text style={styles.emergencyNumberDescription}>
                If you are in immediate danger in India, use a real
                phone to contact emergency services.
              </Text>
            </View>

            <Button
              title="Call emergency number 112"
              danger
              onPress={callEmergency112}
            />

            {!!sosNotice && (
              <View
                style={styles.result}
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.cardTitle}>
                  Important information
                </Text>

                <Text style={styles.message}>
                  {sosNotice}
                </Text>

                <Button
                  title="Dismiss message"
                  secondary
                  onPress={() => setSosNotice('')}
                />
              </View>
            )}
          </>
        )}

        {/* SETTINGS */}

        {tab === 'settings' && (
          <>
            <Header
              title="Personalise your experience"
              desc="Adjust language and trusted contact settings."
            />

            <View style={styles.settingsSection}>
              <Text style={styles.sectionTitle}>
                Spoken language
              </Text>

              <Text style={styles.sectionSub}>
                Select your preferred language.
              </Text>

              {languages.map(item => (
                <TouchableOpacity
                  key={item.code}
                  onPress={() => {
                    setLanguage(item.code);
                    speak(`Language selected: ${item.name}`);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: language === item.code
                  }}
                  style={[
                    styles.languageRow,
                    language === item.code &&
                      styles.selectedLanguage
                  ]}
                >
                  <Text style={styles.languageText}>
                    {item.name}
                  </Text>

                  <Text
                    style={[
                      styles.languageStatus,
                      language === item.code &&
                        styles.selectedLanguageStatus
                    ]}
                  >
                    {language === item.code
                      ? 'SELECTED ✓'
                      : 'SELECT'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.sectionTitle}>
                Trusted contact
              </Text>

              <Text style={styles.sectionSub}>
                Save a phone number for emergency assistance.
              </Text>

              <TextInput
                value={contact}
                onChangeText={setContact}
                placeholder="+91 98765 43210"
                placeholderTextColor={COLORS.muted}
                keyboardType="phone-pad"
                style={styles.input}
                accessibilityLabel="Trusted contact phone number"
              />

              <Button
                title="Save trusted contact"
                onPress={() => {
                  const number = contact.trim();

                  if (number.length < 6) {
                    speak('Please enter a valid phone number.');
                    return;
                  }

                  setContactSaved(number);

                  if (Platform.OS === 'web') {
                    setSosNotice(
                      'Trusted contact saved for this browser session only. It may not remain saved after reloading.'
                    );

                    speak(
                      'Trusted contact saved for this browser session.'
                    );
                  } else {
                    SecureStore.setItemAsync(
                      'trusted_contact',
                      number
                    )
                      .then(() =>
                        speak(
                          'Trusted contact saved securely on this device.'
                        )
                      )
                      .catch(() => {
                        speak(
                          'The contact is available for this session, but secure storage failed.'
                        );

                        Alert.alert(
                          'Contact not saved securely',
                          'The number is available until the app closes, but secure storage failed.'
                        );
                      });
                  }
                }}
              />
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.sectionTitle}>
                Voice test
              </Text>

              <Button
                title="Test spoken response"
                secondary
                onPress={() =>
                  speak(
                    `Hello. VisionMate is ready. Your selected language is ${selectedLanguage.name}.`
                  )
                }
              />
            </View>

            <Text style={styles.safetyNote}>
              Speech recognition and speech synthesis availability
              depends on the speech services installed on your
              Android device.
            </Text>
          </>
        )}
      </ScrollView>

      {/* BOTTOM NAVIGATION */}

      <View style={styles.bottomNav}>
        {(
          ['home', 'talk', 'scan', 'navigate', 'settings'] as Tab[]
        ).map(item => {
          const labels: Record<string, string> = {
            home: 'Home',
            talk: 'Talk',
            scan: 'Scan',
            navigate: 'Travel',
            settings: 'Settings'
          };

          const icons: Record<string, string> = {
            home: '⌂',
            talk: '♫',
            scan: '◉',
            navigate: '⌖',
            settings: '⚙'
          };

          const active = tab === item;

          return (
            <TouchableOpacity
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={labels[item]}
              onPress={() => navigateTo(item, labels[item])}
              style={styles.navItem}
            >
              <View
                style={[
                  styles.navIconWrap,
                  active && styles.navIconWrapActive
                ]}
              >
                <Text
                  style={[
                    styles.navIcon,
                    active && styles.activeNav
                  ]}
                >
                  {icons[item]}
                </Text>
              </View>

              <Text
                style={[
                  styles.navLabel,
                  active && styles.activeNav
                ]}
              >
                {labels[item]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// --------------------------------------------------
// DESIGN SYSTEM
// --------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background
  },

  topbar: {
    backgroundColor: COLORS.deepPlum,
    paddingHorizontal: 19,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11
  },

  brandLogo: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: '#68427F',
    borderWidth: 1,
    borderColor: '#9A76AF',
    alignItems: 'center',
    justifyContent: 'center'
  },

  brandLogoText: {
    fontSize: 27,
    color: '#F1D6F5'
  },

  brand: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0.3,
    color: '#FFFFFF'
  },

  brandAccent: {
    color: '#D8B4F3'
  },

  tagline: {
    fontSize: 9,
    color: '#D6C6E1',
    marginTop: 4,
    letterSpacing: 1.5,
    fontWeight: '700'
  },

  speaker: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#382641',
    borderWidth: 1,
    borderColor: '#594464',
    alignItems: 'center',
    justifyContent: 'center'
  },

  speakerText: {
    color: '#EAD9F5',
    fontSize: 19,
    fontWeight: '800'
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 23,
    paddingBottom: 35
  },

  // HOME

  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 23
  },

  welcomeSmall: {
    color: COLORS.violet,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10
  },

  welcomeTitle: {
    fontSize: 29,
    lineHeight: 36,
    color: COLORS.plum,
    fontWeight: '900',
    letterSpacing: -0.7
  },

  welcomeDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.muted,
    marginTop: 9,
    maxWidth: 260
  },

  welcomeSymbol: {
    width: 77,
    height: 77,
    borderRadius: 26,
    backgroundColor: COLORS.lilac,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DFCEE9'
  },

  welcomeSymbolText: {
    fontSize: 51,
    color: COLORS.violet
  },

  voiceHero: {
    backgroundColor: COLORS.plum,
    borderRadius: 24,
    padding: 20,
    marginBottom: 29,
    borderWidth: 1,
    borderColor: '#594067'
  },

  voiceHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13
  },

  voiceCircle: {
    width: 55,
    height: 55,
    borderRadius: 19,
    backgroundColor: '#65427A',
    alignItems: 'center',
    justifyContent: 'center'
  },

  voiceIcon: {
    color: '#F1DDFB',
    fontSize: 31
  },

  voiceHeroTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900'
  },

  voiceHeroSub: {
    color: '#D9C8E4',
    fontSize: 13,
    marginTop: 5
  },

  voiceArrow: {
    fontSize: 25,
    color: '#E4C8F8'
  },

  voiceHeroFooter: {
    marginTop: 19,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#5B4367',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },

  voiceHeroFooterText: {
    color: '#E4D4EE',
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '800'
  },

  voiceHeroFooterIcon: {
    color: '#DAB5F4',
    fontSize: 13
  },

  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },

  sectionTitle: {
    fontSize: 21,
    color: COLORS.plum,
    fontWeight: '900'
  },

  sectionSub: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 5
  },

  sectionCount: {
    color: COLORS.violet,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '900'
  },

  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12
  },

  featureCard: {
    width: '48%',
    minHeight: 166,
    padding: 15,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 1
  },

  featureCardAccent: {
    backgroundColor: '#F1E8F7',
    borderColor: '#DCCAE9'
  },

  featureIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#F0E6F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },

  featureIconAccent: {
    backgroundColor: '#E3D3F0'
  },

  featureEmoji: {
    color: COLORS.violet,
    fontSize: 25,
    fontWeight: '800'
  },

  featureTitle: {
    color: COLORS.plum,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 6
  },

  featureSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18
  },

  featureArrow: {
    position: 'absolute',
    right: 14,
    top: 14,
    color: '#A18AAE',
    fontSize: 17
  },

  safetyBanner: {
    backgroundColor: COLORS.rose,
    borderColor: '#E9CEDD',
    borderWidth: 1,
    borderRadius: 19,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 24
  },

  safetyBannerIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#E8C9D8',
    alignItems: 'center',
    justifyContent: 'center'
  },

  safetyBannerIconText: {
    color: '#813B5C',
    fontSize: 24,
    fontWeight: '900'
  },

  safetyBannerTitle: {
    color: COLORS.plum,
    fontSize: 15,
    fontWeight: '900'
  },

  safetyBannerSub: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16
  },

  safetyBannerArrow: {
    color: '#8A5070',
    fontSize: 27
  },

  homeFooter: {
    alignItems: 'center',
    marginTop: 23
  },

  homeFooterText: {
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.4
  },

  // PAGE HEADERS

  pageHeader: {
    marginBottom: 21
  },

  pageTitle: {
    fontSize: 28,
    lineHeight: 36,
    color: COLORS.plum,
    fontWeight: '900',
    letterSpacing: -0.5
  },

  pageDescription: {
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 23,
    marginTop: 8
  },

  // BUTTONS

  button: {
    backgroundColor: COLORS.violet,
    paddingVertical: 17,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 57
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center'
  },

  secondaryButton: {
    backgroundColor: COLORS.lilac,
    borderWidth: 1,
    borderColor: '#DCC9E9'
  },

  secondaryButtonText: {
    color: COLORS.plum
  },

  dangerButton: {
    backgroundColor: COLORS.danger
  },

  disabled: {
    opacity: 0.45
  },

  // CHAT

  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EBE3F0',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success
  },

  statusDotActive: {
    backgroundColor: COLORS.brightViolet
  },

  statusText: {
    color: COLORS.plum,
    fontSize: 12,
    fontWeight: '800'
  },

  chatBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 14,
    minHeight: 190,
    borderWidth: 1,
    borderColor: COLORS.border
  },

  emptyChat: {
    alignItems: 'center',
    paddingVertical: 18
  },

  emptyChatIcon: {
    width: 57,
    height: 57,
    borderRadius: 20,
    backgroundColor: COLORS.lilac,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13
  },

  emptyChatSymbol: {
    fontSize: 35,
    color: COLORS.violet
  },

  emptyTitle: {
    color: COLORS.plum,
    fontWeight: '900',
    fontSize: 17,
    marginBottom: 7
  },

  empty: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 22,
    textAlign: 'center'
  },

  bubble: {
    padding: 15,
    borderRadius: 16,
    marginBottom: 11
  },

  userBubble: {
    backgroundColor: '#EDE3F4',
    alignSelf: 'flex-end',
    maxWidth: '92%'
  },

  aiBubble: {
    backgroundColor: '#FAF8FB',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: COLORS.border
  },

  role: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.violet,
    marginBottom: 7,
    letterSpacing: 1.2
  },

  message: {
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 25
  },

  repeat: {
    fontSize: 14,
    color: COLORS.violet,
    fontWeight: '900',
    marginTop: 12
  },

  // INPUTS

  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: '#D9CBDD',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
    marginTop: 12,
    minHeight: 57,
    textAlignVertical: 'top'
  },

  fieldLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.violet,
    marginTop: 18,
    marginBottom: 5,
    letterSpacing: 1.3
  },

  // SCANNER

  scanInfo: {
    backgroundColor: '#EFE6F5',
    borderRadius: 17,
    padding: 16,
    marginBottom: 16
  },

  scanInfoTitle: {
    color: COLORS.plum,
    fontSize: 15,
    fontWeight: '900'
  },

  scanInfoText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5
  },

  cameraWrap: {
    height: 310,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: COLORS.deepPlum,
    marginBottom: 13
  },

  camera: {
    flex: 1
  },

  cameraStatus: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8
  },

  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },

  cameraPlaceholderIcon: {
    color: '#DABCF1',
    fontSize: 50,
    marginBottom: 12
  },

  cameraPlaceholderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 7
  },

  cameraPlaceholderText: {
    color: '#D9C9E5',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20
  },

  result: {
    backgroundColor: COLORS.surface,
    borderRadius: 19,
    padding: 18,
    marginTop: 17,
    borderWidth: 1,
    borderColor: COLORS.border
  },

  resultLabel: {
    color: COLORS.violet,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 9
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.plum,
    marginBottom: 8
  },

  cardSub: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5
  },

  safetyNote: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 21,
    marginTop: 17,
    marginBottom: 9
  },

  // NAVIGATION

  navigationPanel: {
    backgroundColor: COLORS.plum,
    borderRadius: 22,
    padding: 22,
    alignItems: 'center'
  },

  navigationIcon: {
    color: '#E5C7F5',
    fontSize: 52,
    marginBottom: 9
  },

  navigationTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center'
  },

  navigationDescription: {
    color: '#D9C9E4',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center'
  },

  // TEXT READER

  readPanel: {
    backgroundColor: '#F0E7F5',
    borderRadius: 21,
    padding: 22,
    alignItems: 'center'
  },

  readIcon: {
    fontSize: 43,
    color: COLORS.violet,
    marginBottom: 10
  },

  readTitle: {
    fontSize: 19,
    color: COLORS.plum,
    fontWeight: '900'
  },

  readDescription: {
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 21,
    fontSize: 13,
    marginTop: 8
  },

  loadingArea: {
    alignItems: 'center',
    marginTop: 18,
    padding: 12
  },

  loadingText: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20
  },

  readTextInput: {
    minHeight: 190,
    lineHeight: 24
  },

  // EMERGENCY

  emergencyPanel: {
    backgroundColor: COLORS.plum,
    borderRadius: 23,
    padding: 22,
    alignItems: 'center'
  },

  emergencySymbol: {
    width: 54,
    height: 54,
    borderRadius: 19,
    backgroundColor: '#70475E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },

  emergencySymbolText: {
    color: '#FFE1EA',
    fontSize: 30,
    fontWeight: '900'
  },

  emergencyTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900'
  },

  emergencyDescription: {
    color: '#E1D1E9',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8
  },

  emergencyNumber: {
    backgroundColor: '#F4E7EC',
    borderRadius: 19,
    padding: 20,
    alignItems: 'center',
    marginTop: 20
  },

  emergencyNumberLabel: {
    color: '#8D536A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3
  },

  emergencyNumberValue: {
    fontSize: 43,
    color: '#7D2948',
    fontWeight: '900',
    marginVertical: 5
  },

  emergencyNumberDescription: {
    color: '#765B67',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 19
  },

  // SETTINGS

  settingsSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 17
  },

  languageRow: {
    backgroundColor: '#FAF8FB',
    borderRadius: 13,
    padding: 15,
    marginTop: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border
  },

  selectedLanguage: {
    borderColor: COLORS.violet,
    backgroundColor: '#F0E7F7',
    borderWidth: 1.5
  },

  languageText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '700'
  },

  languageStatus: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '900'
  },

  selectedLanguageStatus: {
    color: COLORS.violet
  },

  // BOTTOM NAVIGATION

  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 7,
    paddingBottom: Platform.OS === 'android' ? 8 : 5,
    paddingHorizontal: 4,
    justifyContent: 'space-around'
  },

  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 59
  },

  navIconWrap: {
    minWidth: 42,
    height: 31,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },

  navIconWrapActive: {
    backgroundColor: COLORS.lilac
  },

  navIcon: {
    fontSize: 21,
    color: '#82778A'
  },

  navLabel: {
    fontSize: 10,
    color: '#82778A',
    fontWeight: '700',
    marginTop: 3
  },

  activeNav: {
    color: COLORS.violet,
    fontWeight: '900'
  }
});
