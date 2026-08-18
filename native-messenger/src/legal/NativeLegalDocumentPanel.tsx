import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FileText, Mail, Shield, X } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENTS, type LegalDocumentId } from './oracleLegalDocuments';

type NativeLegalDocumentPanelProps = {
  documentId: LegalDocumentId;
  onClose: () => void;
  embedded?: boolean;
};

export function NativeLegalDocumentPanel({ documentId, onClose, embedded = false }: NativeLegalDocumentPanelProps) {
  const document = LEGAL_DOCUMENTS[documentId];
  const Icon = documentId === 'terms' ? FileText : Shield;

  return (
    <View style={[styles.shell, embedded ? styles.embeddedShell : styles.fullShell]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Icon size={20} color="#FFFFFF" strokeWidth={2.3} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{document.title}</Text>
          <Text style={styles.meta}>Version {document.version} - Derniere mise a jour : {document.updatedAt}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={styles.closeButton}>
          <X size={18} color={colors.header} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        showsVerticalScrollIndicator={!embedded}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.subtitle}>{document.subtitle}</Text>
          <Text style={styles.summary}>{document.summary}</Text>
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              {"Ce document reflete l'architecture auditee du produit. Les points juridiques specifiques doivent etre valides par un conseil competent avant publication definitive."}
            </Text>
          </View>
        </View>

        <View style={styles.toc}>
          <Text style={styles.tocTitle}>Sommaire</Text>
          {document.sections.map(section => (
            <Text key={section.id} style={styles.tocItem}>- {section.title}</Text>
          ))}
        </View>

        {document.sections.map(section => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.body.map((paragraph, index) => (
              <Text key={`${section.id}-${index}`} style={styles.paragraph}>{paragraph}</Text>
            ))}
          </View>
        ))}

        <View style={styles.contactCard}>
          <Mail size={18} color={colors.header} strokeWidth={2.2} />
          <View style={styles.contactCopy}>
            <Text style={styles.contactTitle}>Contact officiel</Text>
            <Text selectable style={styles.contactEmail}>{LEGAL_CONTACT_EMAIL}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fullShell: {
    flex: 1,
  },
  embeddedShell: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    maxHeight: 620,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#102A2A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  header: {
    minHeight: 76,
    backgroundColor: '#EAF4F1',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.header,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  meta: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 3,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  content: {
    padding: 14,
    paddingBottom: 26,
    gap: 12,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: '#FBFDFC',
    padding: 14,
  },
  subtitle: {
    color: colors.header,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '900',
  },
  summary: {
    color: colors.secondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  warningBox: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  warningText: {
    color: '#9A3412',
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
  },
  toc: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.input,
    padding: 14,
  },
  tocTitle: {
    color: colors.title,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    marginBottom: 7,
  },
  tocItem: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  section: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 14,
  },
  sectionTitle: {
    color: colors.header,
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '900',
    marginBottom: 8,
  },
  paragraph: {
    color: colors.text,
    fontSize: 12.6,
    lineHeight: 19,
    fontWeight: '700',
    marginBottom: 8,
  },
  contactCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: '#EAF4F1',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contactCopy: {
    flex: 1,
    minWidth: 0,
  },
  contactTitle: {
    color: colors.header,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  contactEmail: {
    color: colors.brand,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '900',
    marginTop: 1,
  },
});
