export default function TutorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900">
      {children}
    </div>
  );
}
