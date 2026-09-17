import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  VaultStackParamList,
  DocumentType,
  AadhaarData,
  PanData,
  DrivingLicenseData,
} from '../types/document';
import { DocumentTemplate, DocumentTemplateField } from '../types/documentTemplate';
import { documentService } from '../services/documentService';
import { documentTemplateService } from '../services/documentTemplateService';
import { formatDateToISO, formatDocumentDate } from '../utils/date';
import { theme } from '../constants/theme';

type Props = NativeStackScreenProps<VaultStackParamList, 'DocumentEditor'>;

export const DocumentEditorScreen: React.FC<Props> = ({ route, navigation }) => {
  const { documentId, documentType: initialDocType, templateId: initialTemplateId } =
    route.params || {};
  const isEditing = Boolean(documentId);

  const [documentType, setDocumentType] = useState<DocumentType>(
    initialDocType || (initialTemplateId ? 'custom' : 'aadhaar')
  );
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId || null);
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Built-in fields
  const [name, setName] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<string>('');
  const [validFrom, setValidFrom] = useState<string>('');
  const [validUntil, setValidUntil] = useState<string>('');

  // Custom template form values (key -> value)
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  // Active DatePicker state
  const [activeDatePicker, setActiveDatePicker] = useState<{
    target: 'dob' | 'validFrom' | 'validUntil' | 'custom';
    fieldKey?: string;
  } | null>(null);

  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);

      // 1. If editing existing document, load document first
      if (documentId) {
        const { data: doc, error: docErr } = await documentService.getDocument(documentId);
        if (!isMounted) return;

        if (docErr || !doc) {
          Alert.alert('Error', docErr || 'Could not load document.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          setLoading(false);
          return;
        }

        setDocumentType(doc.document_type);
        setTemplateId(doc.template_id || null);

        if (doc.document_type === 'custom') {
          setCustomValues(doc.document_data as Record<string, any>);
          // If document has joined template, use it; otherwise fetch template
          if (doc.template) {
            setTemplate(doc.template);
          } else if (doc.template_id) {
            const { data: tpl } = await documentTemplateService.getTemplate(doc.template_id);
            if (isMounted && tpl) setTemplate(tpl);
          }
        } else {
          // Built-in document
          const docData = doc.document_data as any;
          setName(docData.name || '');
          if (doc.document_type === 'aadhaar') {
            setAadhaarNumber(
              documentService.formatDisplayNumber('aadhaar', (docData as AadhaarData).aadhaarNumber || '')
            );
            setDateOfBirth((docData as AadhaarData).dateOfBirth || '');
          } else if (doc.document_type === 'pan') {
            setPanNumber((docData as PanData).panNumber || '');
          } else if (doc.document_type === 'driving_license') {
            setLicenseNumber((docData as DrivingLicenseData).licenseNumber || '');
            setDateOfBirth((docData as DrivingLicenseData).dateOfBirth || '');
            setValidFrom((docData as DrivingLicenseData).validFrom || '');
            setValidUntil((docData as DrivingLicenseData).validUntil || '');
          }
        }
      } else if (initialTemplateId) {
        // 2. Create mode for custom template
        const { data: tpl, error: tplErr } = await documentTemplateService.getTemplate(initialTemplateId);
        if (!isMounted) return;

        if (tplErr || !tpl) {
          Alert.alert('Error', tplErr || 'Could not load template.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          setLoading(false);
          return;
        }

        setTemplate(tpl);
        setDocumentType('custom');
        setTemplateId(initialTemplateId);

        // Initialize default values for template fields
        const initialForm: Record<string, any> = {};
        (tpl.fields || []).forEach((f) => {
          if (f.field_type === 'boolean') {
            initialForm[f.field_key] = false;
          } else {
            initialForm[f.field_key] = '';
          }
        });
        setCustomValues(initialForm);
      }

      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [documentId, initialTemplateId, navigation]);

  const handleCancel = () => {
    Keyboard.dismiss();
    Alert.alert(
      'Discard changes?',
      'You have unsaved changes. Are you sure you want to discard them?',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  };

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    const current = activeDatePicker;
    setActiveDatePicker(null);

    if (event.type === 'set' && date && current) {
      const dateIso = formatDateToISO(date);
      setValidationError(null);

      if (current.target === 'dob') {
        setDateOfBirth(dateIso);
      } else if (current.target === 'validFrom') {
        setValidFrom(dateIso);
      } else if (current.target === 'validUntil') {
        setValidUntil(dateIso);
      } else if (current.target === 'custom' && current.fieldKey) {
        setCustomValues((prev) => ({ ...prev, [current.fieldKey!]: dateIso }));
      }
    }
  };

  const parseIsoToDate = (isoStr: string): Date => {
    if (!isoStr) return new Date();
    const parts = isoStr.split('-').map(Number);
    if (parts.length === 3) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
  };

  const formatAadhaarInput = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 12);
    const formatted = cleaned.replace(/(\d{4})(?=\d)/g, '$1 ');
    setAadhaarNumber(formatted);
    setValidationError(null);
  };

  const formatPanInput = (text: string) => {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    setPanNumber(cleaned);
    setValidationError(null);
  };

  const handleCustomFieldChange = (key: string, value: any) => {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
    setValidationError(null);
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    setValidationError(null);

    let payloadData: any = {};

    // 1. Custom Template Validation
    if (documentType === 'custom') {
      const templateFields = template?.fields || [];
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      for (const field of templateFields) {
        const val = customValues[field.field_key];

        // Required check
        if (field.required) {
          if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
            setValidationError(`Please enter a value for "${field.field_label}".`);
            return;
          }
        }

        // Email format check
        if (field.field_type === 'email' && val && typeof val === 'string' && val.trim()) {
          if (!emailRegex.test(val.trim())) {
            setValidationError(`Please enter a valid email address for "${field.field_label}".`);
            return;
          }
        }
      }

      payloadData = customValues;
    } else {
      // 2. Built-in Document Validation
      const trimmedName = name.trim();
      if (!trimmedName) {
        setValidationError('Please enter full name.');
        return;
      }

      if (documentType === 'aadhaar') {
        const rawAadhaar = aadhaarNumber.replace(/\D/g, '');
        if (rawAadhaar.length !== 12) {
          setValidationError('Aadhaar number must be exactly 12 digits.');
          return;
        }
        if (!dateOfBirth) {
          setValidationError('Please select Date of Birth.');
          return;
        }
        payloadData = {
          aadhaarNumber: rawAadhaar,
          name: trimmedName,
          dateOfBirth,
        };
      } else if (documentType === 'pan') {
        const trimmedPan = panNumber.trim().toUpperCase();
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(trimmedPan)) {
          setValidationError('Invalid PAN format (e.g. ABCDE1234F).');
          return;
        }
        payloadData = {
          panNumber: trimmedPan,
          name: trimmedName,
        };
      } else if (documentType === 'driving_license') {
        const trimmedLicense = licenseNumber.trim().toUpperCase();
        if (!trimmedLicense) {
          setValidationError('Please enter Driving Licence number.');
          return;
        }
        if (!dateOfBirth) {
          setValidationError('Please select Date of Birth.');
          return;
        }
        if (!validFrom) {
          setValidationError('Please select Valid From date.');
          return;
        }
        if (!validUntil) {
          setValidationError('Please select Valid Until date.');
          return;
        }
        if (validUntil < validFrom) {
          setValidationError('Valid Until date must be on or after Valid From date.');
          return;
        }
        payloadData = {
          licenseNumber: trimmedLicense,
          name: trimmedName,
          dateOfBirth,
          validFrom,
          validUntil,
        };
      }
    }

    setSaving(true);

    try {
      if (isEditing && documentId) {
        const { error } = await documentService.updateDocument(documentId, payloadData);
        if (error) {
          setSaving(false);
          Alert.alert('Unable to Save', error);
          return;
        }
      } else {
        const { error } = await documentService.createDocument(documentType, payloadData, templateId);
        if (error) {
          setSaving(false);
          Alert.alert('Unable to Save', error);
          return;
        }
      }

      navigation.goBack();
    } catch {
      setSaving(false);
      Alert.alert('Unable to Save', 'Unable to save document. Please try again.');
    }
  };

  const displayName =
    documentType === 'custom'
      ? template?.name || 'Custom Document'
      : documentService.getDisplayName(documentType);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primaryLight} />
          <Text style={styles.loadingText}>Loading document form...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={saving}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {isEditing ? `Edit ${displayName}` : `Add ${displayName}`}
        </Text>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Validation Error Banner */}
          {validationError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
              <Text style={styles.errorBannerText}>{validationError}</Text>
            </View>
          )}

          {/* DYNAMIC FORM FOR CUSTOM TEMPLATES */}
          {documentType === 'custom' ? (
            <View>
              {(template?.fields || []).map((f: DocumentTemplateField) => {
                const val = customValues[f.field_key];

                return (
                  <View key={f.id} style={styles.formGroup}>
                    <View style={styles.labelRow}>
                      <Text style={styles.label}>
                        {f.field_label}{' '}
                        {f.required ? <Text style={styles.required}>*</Text> : null}
                      </Text>
                      {f.sensitive ? (
                        <View style={styles.sensitivePill}>
                          <Ionicons name="lock-closed" size={11} color={theme.colors.warning} />
                          <Text style={styles.sensitivePillText}>Sensitive</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Text Field */}
                    {f.field_type === 'text' && (
                      <TextInput
                        style={[styles.input, f.mask_enabled && styles.monoInput]}
                        placeholder={`Enter ${f.field_label}`}
                        placeholderTextColor={theme.colors.textMuted}
                        value={val !== undefined ? String(val) : ''}
                        onChangeText={(t) => handleCustomFieldChange(f.field_key, t)}
                        autoCapitalize="words"
                      />
                    )}

                    {/* Number Field (keeps string representation to preserve leading zeros) */}
                    {f.field_type === 'number' && (
                      <TextInput
                        style={[styles.input, styles.monoInput]}
                        placeholder={`Enter ${f.field_label}`}
                        placeholderTextColor={theme.colors.textMuted}
                        value={val !== undefined ? String(val) : ''}
                        onChangeText={(t) => handleCustomFieldChange(f.field_key, t)}
                        keyboardType="numeric"
                      />
                    )}

                    {/* Date Field */}
                    {f.field_type === 'date' && (
                      <TouchableOpacity
                        style={styles.dateSelector}
                        onPress={() =>
                          setActiveDatePicker({ target: 'custom', fieldKey: f.field_key })
                        }
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          color={theme.colors.primaryLight}
                        />
                        <Text
                          style={[
                            styles.dateText,
                            !val && styles.dateTextPlaceholder,
                          ]}
                        >
                          {val ? formatDocumentDate(String(val)) : `Select ${f.field_label}`}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Multiline Text Field */}
                    {f.field_type === 'multiline' && (
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        placeholder={`Enter ${f.field_label}`}
                        placeholderTextColor={theme.colors.textMuted}
                        value={val !== undefined ? String(val) : ''}
                        onChangeText={(t) => handleCustomFieldChange(f.field_key, t)}
                        multiline
                        numberOfLines={3}
                      />
                    )}

                    {/* Phone Field */}
                    {f.field_type === 'phone' && (
                      <TextInput
                        style={[styles.input, styles.monoInput]}
                        placeholder="e.g. +91 9876543210"
                        placeholderTextColor={theme.colors.textMuted}
                        value={val !== undefined ? String(val) : ''}
                        onChangeText={(t) => handleCustomFieldChange(f.field_key, t)}
                        keyboardType="phone-pad"
                      />
                    )}

                    {/* Email Field */}
                    {f.field_type === 'email' && (
                      <TextInput
                        style={styles.input}
                        placeholder="name@example.com"
                        placeholderTextColor={theme.colors.textMuted}
                        value={val !== undefined ? String(val) : ''}
                        onChangeText={(t) => handleCustomFieldChange(f.field_key, t)}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    )}

                    {/* Boolean Switch Field */}
                    {f.field_type === 'boolean' && (
                      <View style={styles.booleanRow}>
                        <Text style={styles.booleanLabelText}>
                          {val ? 'Yes / Enabled' : 'No / Disabled'}
                        </Text>
                        <Switch
                          value={Boolean(val)}
                          onValueChange={(b) => handleCustomFieldChange(f.field_key, b)}
                          trackColor={{
                            false: theme.colors.surfaceElevated,
                            true: theme.colors.primary,
                          }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            /* BUILT-IN FORM (Aadhaar, PAN, DL) */
            <View>
              {documentType === 'aadhaar' && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>
                    Aadhaar Number <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, styles.monoInput]}
                    placeholder="1234 5678 9012"
                    placeholderTextColor={theme.colors.textMuted}
                    value={aadhaarNumber}
                    onChangeText={formatAadhaarInput}
                    keyboardType="number-pad"
                    maxLength={14}
                    autoCorrect={false}
                  />
                  <Text style={styles.helperText}>12 digits. Spaces allowed during entry.</Text>
                </View>
              )}

              {documentType === 'pan' && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>
                    PAN Number <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, styles.monoInput]}
                    placeholder="ABCDE1234F"
                    placeholderTextColor={theme.colors.textMuted}
                    value={panNumber}
                    onChangeText={formatPanInput}
                    autoCapitalize="characters"
                    maxLength={10}
                    autoCorrect={false}
                  />
                  <Text style={styles.helperText}>Standard format: 5 letters, 4 digits, 1 letter.</Text>
                </View>
              )}

              {documentType === 'driving_license' && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>
                    License Number <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, styles.monoInput]}
                    placeholder="DL-1420110012345"
                    placeholderTextColor={theme.colors.textMuted}
                    value={licenseNumber}
                    onChangeText={(text) => {
                      setLicenseNumber(text.toUpperCase());
                      setValidationError(null);
                    }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Full Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  ref={nameInputRef}
                  style={styles.input}
                  placeholder="Name as displayed on document"
                  placeholderTextColor={theme.colors.textMuted}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setValidationError(null);
                  }}
                  autoCapitalize="words"
                />
              </View>

              {(documentType === 'aadhaar' || documentType === 'driving_license') && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>
                    Date of Birth <Text style={styles.required}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={styles.dateSelector}
                    onPress={() => setActiveDatePicker({ target: 'dob' })}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.primaryLight} />
                    <Text
                      style={[
                        styles.dateText,
                        !dateOfBirth && styles.dateTextPlaceholder,
                      ]}
                    >
                      {dateOfBirth ? formatDocumentDate(dateOfBirth) : 'Select Date of Birth'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {documentType === 'driving_license' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>
                      Valid From <Text style={styles.required}>*</Text>
                    </Text>
                    <TouchableOpacity
                      style={styles.dateSelector}
                      onPress={() => setActiveDatePicker({ target: 'validFrom' })}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="calendar-outline" size={18} color={theme.colors.primaryLight} />
                      <Text
                        style={[
                          styles.dateText,
                          !validFrom && styles.dateTextPlaceholder,
                        ]}
                      >
                        {validFrom ? formatDocumentDate(validFrom) : 'Select Valid From Date'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>
                      Valid Until <Text style={styles.required}>*</Text>
                    </Text>
                    <TouchableOpacity
                      style={styles.dateSelector}
                      onPress={() => setActiveDatePicker({ target: 'validUntil' })}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="calendar-outline" size={18} color={theme.colors.primaryLight} />
                      <Text
                        style={[
                          styles.dateText,
                          !validUntil && styles.dateTextPlaceholder,
                        ]}
                      >
                        {validUntil ? formatDocumentDate(validUntil) : 'Select Valid Until Date'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Active DateTimePicker */}
          {activeDatePicker && (
            <DateTimePicker
              value={
                activeDatePicker.target === 'dob'
                  ? parseIsoToDate(dateOfBirth)
                  : activeDatePicker.target === 'validFrom'
                  ? parseIsoToDate(validFrom)
                  : activeDatePicker.target === 'validUntil'
                  ? parseIsoToDate(validUntil)
                  : parseIsoToDate(customValues[activeDatePicker.fieldKey || ''] || '')
              }
              mode="date"
              display="default"
              onChange={handleDateChange}
              maximumDate={
                activeDatePicker.target === 'dob' ? new Date() : undefined
              }
            />
          )}

          <View style={styles.securityNotice}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.success} />
            <Text style={styles.securityNoticeText}>
              Your sensitive data is strictly isolated by Supabase Row Level Security.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  cancelButtonText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  headerTitle: {
    fontSize: theme.typography.fontSizes.md + 1,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    maxWidth: '65%',
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    minWidth: 64,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    padding: theme.spacing.md,
    paddingBottom: 40,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: theme.spacing.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.xs + 1,
    color: theme.colors.danger,
    marginLeft: 8,
    lineHeight: 18,
  },
  formGroup: {
    marginBottom: theme.spacing.md + 2,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  sensitivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  sensitivePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.warning,
    marginLeft: 3,
  },
  required: {
    color: theme.colors.danger,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textPrimary,
  },
  monoInput: {
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  booleanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  booleanLabelText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  helperText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
  },
  dateText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textPrimary,
    marginLeft: 10,
    fontWeight: '500',
  },
  dateTextPlaceholder: {
    color: theme.colors.textMuted,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    marginTop: theme.spacing.md,
  },
  securityNoticeText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginLeft: 8,
    lineHeight: 18,
  },
});
