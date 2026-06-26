import React, { useState, useEffect } from 'react';
import { View, TextInput, Button, FlatList, Text } from 'react-native';
import { getFirestore, collection, addDoc, query, where, onSnapshot } from 'firebase/firestore';

const ChatScreen = ({ route }) => {
  const { userId } = route.params;
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'messages'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      setMessages(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [userId]);

  const sendMessage = async () => {
    const db = getFirestore();
    await addDoc(collection(db, 'messages'), {
      userId,
      text: message,
      timestamp: new Date()
    });
    setMessage('');
  };

  return (
    <View>
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <Text>{item.text}</Text>}
      />
      <TextInput value={message} onChangeText={setMessage} placeholder="Type a message" />
      <Button title="Send" onPress={sendMessage} />
    </View>
  );
};

export default ChatScreen;