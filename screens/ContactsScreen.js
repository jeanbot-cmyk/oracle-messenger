import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Button } from 'react-native';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const ContactsScreen = ({ navigation }) => {
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    const db = getFirestore();
    const fetchContacts = async () => {
      const querySnapshot = await getDocs(collection(db, 'users'));
      setContacts(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchContacts();
  }, []);

  return (
    <View>
      <FlatList
        data={contacts}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View>
            <Text>{item.name}</Text>
            <Button title="Chat" onPress={() => navigation.navigate('Chat', { userId: item.id })} />
          </View>
        )}
      />
    </View>
  );
};

export default ContactsScreen;