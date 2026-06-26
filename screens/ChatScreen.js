import React, { useState, useEffect } from 'react';
import { View, TextInput, Button, FlatList, Text } from 'react-native';
import { firestore } from '../firebaseConfig';

const ChatScreen = ({ route }) => {
  const { chatId } = route.params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    const unsubscribe = firestore.collection('chats').doc(chatId).collection('messages').orderBy('createdAt')
      .onSnapshot(snapshot => {
        setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    return unsubscribe;
  }, [chatId]);

  const sendMessage = () => {
    firestore.collection('chats').doc(chatId).collection('messages').add({
      text: newMessage,
      createdAt: new Date()
    });
    setNewMessage('');
  };

  return (
    <View>
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <Text>{item.text}</Text>}
      />
      <TextInput value={newMessage} onChangeText={setNewMessage} />
      <Button title="Send" onPress={sendMessage} />
    </View>
  );
};

export default ChatScreen;