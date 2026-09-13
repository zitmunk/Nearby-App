// components/Screen.tsx
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  backgroundColor?: string;
  paddingHorizontal?: number;
  paddingBottom?: number;
  paddingTop?: number;
  statusBarStyle?: 'light' | 'dark' | 'auto';
}

export function Screen({ 
  children, 
  scroll = true, 
  style, 
  backgroundColor = '#050507',
  paddingHorizontal = 20,
  paddingBottom = 20,
  paddingTop = 20,
  statusBarStyle = 'light',
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const contentStyle = {
    paddingTop: insets.top + paddingTop,
    paddingBottom: insets.bottom + paddingBottom,
    paddingHorizontal: paddingHorizontal,
  };

  if (scroll) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <StatusBar style={statusBarStyle} />
        <ScrollView 
          contentContainerStyle={[contentStyle, style]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, contentStyle, style, { backgroundColor }]}>
      <StatusBar style={statusBarStyle} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});