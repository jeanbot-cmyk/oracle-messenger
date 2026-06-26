import React, { useEffect, useState } from 'react';
import { View, Text, Button, FlatList } from 'react-native';
import { auth, firestore } from '../firebaseConfig';

const HomeScreen = ({ navigation }) => {
  const [chats, setChats] = useState([]);

  useEffect(() => {
    const unsubscribe = firestore.collection('chats').onSnapshot(snapshot => {
      setChats(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, []);

  return (
    <View>
      <FlatList
        data={chats}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <Button title={item.name} onPress={() => navigation.navigate('Chat', { chatId: item.id })} />
        )}
      />
    </View>
  );
};

export default HomeScreen;