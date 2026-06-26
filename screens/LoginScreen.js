import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { auth } from '../firebaseConfig';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    auth.signInWithEmailAndPassword(email, password)
      .then(() => navigation.navigate('Home'))
      .catch(error => alert(error.message));
  };

  return (
    <View>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <Button title="Login" onPress={handleLogin} />
    </View>
  );
};

export default LoginScreen;