import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Platform, StyleSheet,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type Props = {
  value: string;
  onChange: (ymd: string) => void;
  placeholder?: string;
  style?: object;
  minimumDate?: Date;
};

export function DatePickerButton({ value, onChange, placeholder = 'Select date', style, minimumDate }: Props) {
  const colors = useColors();
  const [showPicker, setShowPicker] = useState(false);

  const parsedDate = value ? new Date(value + 'T00:00:00') : new Date();
  const isSet = !!value;

  function handleChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (selected) {
      onChange(toYMD(selected));
    }
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webWrapper, { borderColor: colors.border, backgroundColor: colors.card }, style]}>
        <Feather name="calendar" size={16} color={colors.mutedForeground} style={styles.icon} />
        <Text style={[styles.webLabel, { color: isSet ? colors.foreground : colors.mutedForeground }]}>
          {isSet ? formatDate(parsedDate) : placeholder}
        </Text>
        <input
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: 'pointer',
            width: '100%',
            height: '100%',
          }}
        />
      </View>
    );
  }

  if (Platform.OS === 'android') {
    return (
      <>
        <TouchableOpacity
          style={[styles.button, { borderColor: colors.border, backgroundColor: colors.card }, style]}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.7}
        >
          <Feather name="calendar" size={16} color={colors.mutedForeground} style={styles.icon} />
          <Text style={[styles.label, { color: isSet ? colors.foreground : colors.mutedForeground }]}>
            {isSet ? formatDate(parsedDate) : placeholder}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
        {showPicker && (
          <DateTimePicker
            mode="date"
            display="default"
            value={parsedDate}
            onChange={handleChange}
            minimumDate={minimumDate}
          />
        )}
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.button, { borderColor: colors.border, backgroundColor: colors.card }, style]}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.7}
      >
        <Feather name="calendar" size={16} color={colors.mutedForeground} style={styles.icon} />
        <Text style={[styles.label, { color: isSet ? colors.foreground : colors.mutedForeground }]}>
          {isSet ? formatDate(parsedDate) : placeholder}
        </Text>
        <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowPicker(false)}>
          <View style={[styles.iosSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iosHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={[styles.iosDone, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.iosTitle, { color: colors.foreground }]}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={[styles.iosDone, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={parsedDate}
              onChange={handleChange}
              minimumDate={minimumDate}
              style={{ height: 200 }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
  },
  icon: { flexShrink: 0 },
  label: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  iosSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  iosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iosTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600' as const,
  },
  iosDone: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  webWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  webLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
});
